import type { Client } from 'discord.js';
import type { PrismaClientType, VoiceService } from 'database';
import { usageQueries } from 'database';
import type { AudioPlayer } from '@discordjs/voice';
import { createAudioPlayer } from '@discordjs/voice';

import type { RedisClient } from '@/bot.js';
import { ACTIVATION_COMMAND } from '@/services/langchain.js';
import { checkLinesForVoiceActivation, chimeInOnTranscript } from '@/services/langchain.js';
import { playFilePath } from '@/services/textToSpeech.js';
import { startTalkingBoops } from '@/services/audioResources.js';

import type { Utterance } from './utterance.js';
import type { Meeting } from './meeting.js';
import type { Teno } from './teno.js';
import { VoicePipeline } from './voicePipeline.js';
export class Responder {
	private teno: Teno;
	private client: Client;
	private redisClient: RedisClient;
	private prismaClient: PrismaClientType;
	private speaking = false;
	private thinking = false;
	private audioPlayer: AudioPlayer = createAudioPlayer();

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

	stopThinking = () => {
		this.thinking = false;
	};

	public startSpeaking() {
		this.speaking = true;
	}

	stopSpeaking = () => {
		this.speaking = false;
	};

	public getTeno(): Teno {
		return this.teno;
	}

	public getCachedVoiceConfig() {
		return this.teno.getVoiceService() as Omit<VoiceService, 'service'> & { service: 'azure' | 'elevenlabs' };
	}

	stopResponding = () => {
		this.stopSpeaking();
		this.stopThinking();
		this.audioPlayer.stop();
	};

	respondOnUtteranceIfAble = async (utterance: Utterance, meeting: Meeting) => {
		if (utterance.textContent && utterance.textContent.length > 0) {
			const speechOn = this.teno.getSpeechOn();
			if (speechOn) {
				// should the bot respond or should it stop talking?
				const botAnalysis = await this.isBotResponseExpected(meeting);

				if (botAnalysis === ACTIVATION_COMMAND.SPEAK) {
					if (!this.isSpeaking()) {
						this.respondToTranscript(meeting);
					}
				} else if (botAnalysis === ACTIVATION_COMMAND.STOP) {
					this.stopResponding();
				}
			}
		}
	};

	public async respondToTranscript(meeting: Meeting): Promise<void> {
		this.startSpeaking();
		this.startThinking();

		const onEnd = () => {
			this.stopThinking();
			this.stopSpeaking();
		};

		// play starting boops
		playFilePath(createAudioPlayer(), startTalkingBoops(), meeting.getConnection());

		const voicePipeline = new VoicePipeline({ teno: this.teno, meeting, onEnd });

		const answerOutput = await chimeInOnTranscript(
			await meeting.getTranscript().getCleanedTranscript(),
			'gpt-3.5-turbo',
			voicePipeline.onNewToken,
			voicePipeline.complete,
		);

		if (answerOutput.status === 'success') {
			this.createAIUsageEvent(answerOutput.languageModel, answerOutput.promptTokens, answerOutput.completionTokens);
			meeting.addBotLine(answerOutput.answer, 'Teno');
		}
	}

	private async isBotResponseExpected(meeting: Meeting): Promise<ACTIVATION_COMMAND> {
		const numCheckLines = 10; // Set this value to modulate how many lines you want to check

		const vConfig = this.getCachedVoiceConfig();
		const checkLines = await meeting.getTranscript().getRecentTranscript(numCheckLines);

		if (vConfig && checkLines.length) {
			// console.log('checkLines', checkLines);
			return await checkLinesForVoiceActivation(checkLines);
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
