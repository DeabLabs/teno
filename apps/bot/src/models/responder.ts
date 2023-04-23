import type { Client } from 'discord.js';
import type { PrismaClientType } from 'database';
import { usageQueries } from 'database';

import type { RedisClient } from '@/bot.js';
import { playArrayBuffer, getArrayBufferFromText } from '@/services/textToSpeech.js';
import { checkLinesForVoiceActivation, chimeInOnTranscript } from '@/services/langchain.js';

import type { Meeting } from './meeting.js';
import type { Teno } from './teno.js';

export class Responder {
	private teno: Teno;
	private client: Client;
	private redisClient: RedisClient;
	private prismaClient: PrismaClientType;
	private speaking = false;
	private thinking = false;

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

	public async respondToTranscript(meeting: Meeting): Promise<void> {
		this.startSpeaking();
		this.startThinking();
		const sentenceQueue = new SentenceQueue(this, meeting);

		const onNewToken = (token: string) => {
			sentenceQueue.handleNewToken(token);
		};

		const onEnd = () => {
			this.stopThinking();
		};

		const answerOutput = await chimeInOnTranscript(
			await meeting.getTranscript().getCleanedTranscript(),
			'gpt-4',
			onNewToken,
			onEnd,
		);
		if (answerOutput.status === 'success') {
			this.createAIUsageEvent(answerOutput.languageModel, answerOutput.promptTokens, answerOutput.completionTokens);
			meeting.addBotLine(answerOutput.answer, 'Teno');
		}
	}

	public async isBotResponseExpected(meeting: Meeting): Promise<boolean> {
		const numCheckLines = 10; // Set this value to modulate how many lines you want to check

		const vConfig = await this.teno.getVoiceService();
		const transcriptLines = await meeting.getTranscript().getCleanedTranscript();
		if (vConfig && transcriptLines) {
			const checkLines = transcriptLines.slice(-numCheckLines);
			console.log('checkLines', checkLines);
			return await checkLinesForVoiceActivation(checkLines);
		}
		return false;
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
	audioBuffer: ArrayBuffer | null;
};

class SentenceQueue {
	private queue: SentenceAudio[] = [];
	private currentSentence = '';

	constructor(private responder: Responder, private meeting: Meeting) {}

	public async handleNewToken(token: string): Promise<void> {
		const splitTokens = ['.', '?', '!', ';', '...'];
		this.currentSentence = `${this.currentSentence}${token}`;

		if (splitTokens.some((splitToken) => token.includes(splitToken))) {
			const tempSentence = this.currentSentence;
			this.currentSentence = '';
			await this.enqueueSentence(tempSentence.trim());

			if (this.queue.length === 1) {
				this.playNextSentence();
			}
		}
	}

	private async playNextSentence(): Promise<void> {
		if (this.queue.length > 0) {
			const sentenceAudio = this.queue[0];
			if (sentenceAudio && sentenceAudio.audioBuffer) {
				console.log('Playing sentence: ' + sentenceAudio.sentence);
				await this.playAudioBuffer(sentenceAudio.audioBuffer);
				this.queue.shift();
				this.playNextSentence();
			}
		}

		if (!this.responder.isThinking() && this.queue.length === 0) {
			this.responder.stopSpeaking();
		}
	}

	private async enqueueSentence(sentence: string): Promise<void> {
		const audioBuffer = await this.createAudioBufferFromSentence(sentence);
		this.queue.push({ sentence, audioBuffer });
	}

	private async createAudioBufferFromSentence(sentence: string): Promise<ArrayBuffer | null> {
		const vConfig = await this.responder.getTeno().getVoiceService();
		if (vConfig) {
			try {
				const audioBuffer = await getArrayBufferFromText({
					service: 'azure',
					apiKey: vConfig.apiKey,
					text: sentence,
				});
				return audioBuffer;
			} catch (error) {
				console.error('Error converting text to speech:', error);
			}
		}
		return null;
	}

	private async playAudioBuffer(audioBuffer: ArrayBuffer): Promise<void> {
		const vConfig = await this.responder.getTeno().getVoiceService();
		if (vConfig) {
			try {
				await playArrayBuffer(audioBuffer, this.meeting.getConnection());
			} catch (error) {
				console.error('Error playing audio:', error);
			}
		}
		return;
	}
}
