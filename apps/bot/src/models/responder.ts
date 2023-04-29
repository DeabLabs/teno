import type { Client } from 'discord.js';
import type { PrismaClientType, VoiceService } from 'database';
import { usageQueries } from 'database';
import type { AudioPlayer } from '@discordjs/voice';
import { createAudioPlayer } from '@discordjs/voice';

import type { RedisClient } from '@/bot.js';
import type { TTSParams } from '@/services/textToSpeech.js';
import { playFilePath } from '@/services/textToSpeech.js';
import { playArrayBuffer, getArrayBufferFromText } from '@/services/textToSpeech.js';
import type { AnswerOutput } from '@/services/langchain.js';
import { ACTIVATION_COMMAND, personaChimeInOnTranscript } from '@/services/langchain.js';
import { checkLinesForVoiceActivation, chimeInOnTranscript } from '@/services/langchain.js';
import { endTalkingBoops } from '@/services/audioResources.js';

import type { Meeting } from './meeting.js';
import type { Teno } from './teno.js';
export class Responder {
	private teno: Teno;
	private client: Client;
	private redisClient: RedisClient;
	private prismaClient: PrismaClientType;
	private speaking = false;
	private thinking = false;
	private sentenceQueue: SentenceQueue | null = null;
	private audioPlayer: AudioPlayer = createAudioPlayer();
	public playEndBoops = true;

	constructor({
		teno,
		client,
		redisClient,
		prismaClient,
	}: {
		teno: Teno;
		client: Client;
		redisClient: RedisClient;
		prismaClient: PrismaClientType;
	}) {
		this.teno = teno;
		this.client = client;
		this.redisClient = redisClient;
		this.prismaClient = prismaClient;
	}

	public startThinking() {
		this.thinking = true;
	}

	public stopThinking() {
		this.thinking = false;
	}

	public startSpeaking() {
		this.speaking = true;
	}

	public stopSpeaking() {
		this.speaking = false;
	}

	public getTeno(): Teno {
		return this.teno;
	}

	public getAudioPlayer() {
		this.audioPlayer = createAudioPlayer();

		return this.audioPlayer;
	}

	public getCachedVoiceConfig() {
		return this.teno.getVoiceService() as Omit<VoiceService, 'service'> & { service: 'azure' | 'elevenlabs' };
	}

	public stopResponding() {
		this.playEndBoops = false;
		this.stopSpeaking();
		this.stopThinking();
		this.sentenceQueue?.destroy();
		this.sentenceQueue = null;
		this.audioPlayer.stop();
	}

	public async respondToTranscript(meeting: Meeting): Promise<void> {
		this.startSpeaking();
		this.startThinking();
		this.sentenceQueue = new SentenceQueue(this, meeting);
		const handleNewToken = this.sentenceQueue.handleNewToken.bind(this.sentenceQueue);

		const onNewToken = async (token: string) => {
			handleNewToken?.(token);
		};

		const onEnd = () => {
			this.stopThinking();
		};

		const persona = meeting.getPersona();

		let answerOutput: AnswerOutput;

		if (!persona) {
			answerOutput = await chimeInOnTranscript(
				await meeting.getTranscript().getCleanedTranscript(),
				'gpt-4',
				onNewToken,
				onEnd,
			);
		} else {
			answerOutput = await personaChimeInOnTranscript(
				await meeting.getTranscript().getCleanedTranscript(),
				persona.name,
				persona.description,
				'gpt-4',
				onNewToken,
				onEnd,
			);
		}

		if (answerOutput.status === 'success') {
			this.createAIUsageEvent(answerOutput.languageModel, answerOutput.promptTokens, answerOutput.completionTokens);
			if (!persona) {
				meeting.addBotLine(answerOutput.answer, 'Teno');
			} else {
				meeting.addBotLine(answerOutput.answer, persona.name);
			}
		}
	}

	public async isBotResponseExpected(meeting: Meeting): Promise<ACTIVATION_COMMAND> {
		const numCheckLines = 10; // Set this value to modulate how many lines you want to check

		const vConfig = this.getCachedVoiceConfig();
		const checkLines = await meeting.getTranscript().getRecentTranscript(numCheckLines);

		if (vConfig && checkLines.length) {
			// console.log('checkLines', checkLines);
			const persona = meeting.getPersona();
			if (!persona) {
				return await checkLinesForVoiceActivation(checkLines, 'gpt-3.5-turbo', 'Teno');
			} else {
				return await checkLinesForVoiceActivation(checkLines, 'gpt-3.5-turbo', persona.name);
			}
		}

		return ACTIVATION_COMMAND.PASS;
	}

	private createAIUsageEvent(languageModel: string, promptTokens: number, completionTokens: number) {
		usageQueries.createUsageEvent(this.prismaClient, {
			discordGuildId: this.teno.id,
			languageModel: languageModel,
			promptTokens: promptTokens,
			completionTokens: completionTokens,
		});
	}

	public isSpeaking(): boolean {
		return this.speaking;
	}

	public isThinking(): boolean {
		return this.thinking;
	}
}

type SentenceAudio = {
	sentence: string;
	audioBuffer: Promise<ArrayBuffer | null>;
};

class SentenceQueue {
	private destroyed = false;
	private queue: SentenceAudio[] = [];
	private currentSentence = '';

	constructor(private responder: Responder, private meeting: Meeting) {}

	public destroy() {
		this.queue = [];
		this.currentSentence = '';
		this.destroyed = true;
	}

	public async handleNewToken(token: string): Promise<void> {
		const splitTokens = ['.', '?', '!', ':', ';'];
		this.currentSentence = `${this.currentSentence}${token}`;

		if (splitTokens.some((splitToken) => token.includes(splitToken))) {
			const tempSentence = this.currentSentence;
			this.currentSentence = '';
			this.enqueueSentence(tempSentence.trim());

			if (this.queue.length === 1) {
				this.playNextSentence();
			}
		}
	}

	private async playNextSentence(): Promise<void> {
		if (this.queue.length > 0) {
			console.time('respondToTranscript');
			const sentenceAudio = this.queue[0];
			const vConfig = this.responder.getCachedVoiceConfig();
			if (sentenceAudio && sentenceAudio.audioBuffer && vConfig !== null) {
				// console.log('Playing sentence: ' + sentenceAudio.sentence);
				const buffer = await sentenceAudio.audioBuffer;
				if (buffer && !this.destroyed) {
					this.meeting.addBotLine(sentenceAudio.sentence, 'Teno');
					await this.playAudioBuffer(this.responder.getAudioPlayer(), buffer, vConfig.service);
				}
				this.queue.shift();
				return await this.playNextSentence();
			}
		}

		if (!this.responder.isThinking() && this.queue.length === 0) {
			this.responder.stopSpeaking();

			if (this.responder.playEndBoops) {
				await playFilePath(this.responder.getAudioPlayer(), endTalkingBoops(), this.meeting.getConnection());
			}

			this.responder.playEndBoops = true;
		}
	}

	private enqueueSentence(sentence: string): void {
		const audioBuffer = this.createAudioBufferFromSentence(sentence);
		this.queue.push({ sentence, audioBuffer });
	}

	private async createAudioBufferFromSentence(sentence: string): Promise<ArrayBuffer | null> {
		const vConfig = this.responder.getTeno().getVoiceService();
		const service = vConfig?.service;
		if (vConfig) {
			try {
				switch (service) {
					case 'azure':
						return await getArrayBufferFromText({
							service,
							apiKey: vConfig.apiKey,
							text: sentence,
						});
					case 'elevenlabs':
						return await getArrayBufferFromText({
							service,
							apiKey: vConfig.apiKey,
							text: sentence,
							voiceId: vConfig.voiceKey,
						});
					default:
						throw new Error('Invalid voice service');
				}
			} catch (error) {
				console.error('Error converting text to speech:', error);
			}
		}
		return null;
	}

	private async playAudioBuffer(
		audioPlayer: AudioPlayer,
		audioBuffer: ArrayBuffer,
		service: TTSParams['service'],
	): Promise<void> {
		const vConfig = this.responder.getCachedVoiceConfig();
		if (vConfig) {
			try {
				await playArrayBuffer(audioPlayer, audioBuffer, this.meeting.getConnection(), service);
			} catch (error) {
				console.error('Error playing audio:', error);
			}
		}
		return;
	}
}
