import type { Client } from 'discord.js';
import type { PrismaClientType, VoiceService } from 'database';
import { usageQueries } from 'database';

import type { RedisClient } from '@/bot.js';

import type { Teno } from './teno.js';
import type { Meeting } from './meeting.js';
export class Responder {
	private teno: Teno;
	private client: Client;
	private redisClient: RedisClient;
	private prismaClient: PrismaClientType;

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

	public getTeno(): Teno {
		return this.teno;
	}

	public getCachedVoiceConfig() {
		return this.teno.getVoiceService() as Omit<VoiceService, 'service'> & { service: 'azure' | 'elevenlabs' };
	}

	private createAIUsageEvent(languageModel: string, promptTokens: number, completionTokens: number) {
		usageQueries.createUsageEvent(this.prismaClient, {
			discordGuildId: this.teno.id,
			languageModel: languageModel,
			promptTokens: promptTokens,
			completionTokens: completionTokens,
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async respondToTranscript(meeting: Meeting) {
		throw new Error('Not implemented');
	}
}
