import type { PrismaClientType } from 'database';
import { transcriptQueries } from 'kv';
import { countMessageTokens } from 'llm';

import type { RedisClient } from '@/bot.js';

type TranscriptArgs = {
	id: number;
	meetingId: number;
	redisClient: RedisClient;
	transcriptKey: string;
	prismaClient: PrismaClientType;
};

type TranscriptLoadArgs = Omit<TranscriptArgs, 'id'> & {
	id?: number;
	meetingId?: number;
};

export class Transcript {
	private id: number;
	private meetingId: number;
	private prismaClient: PrismaClientType;
	private redisClient: RedisClient;
	private transcriptKey: string;
	private tokens = 0;

	private constructor({ redisClient, transcriptKey, prismaClient, meetingId, id }: TranscriptArgs) {
		this.redisClient = redisClient;
		this.transcriptKey = transcriptKey;
		this.prismaClient = prismaClient;
		this.meetingId = meetingId;
		this.id = id;

		// Bind methods
		this.appendTranscript = this.appendTranscript.bind(this);
		this.getTranscript = this.getTranscript.bind(this);
	}

	static async load(args: TranscriptLoadArgs) {
		try {
			const _transcript = await args.prismaClient.transcript.upsert({
				where: { redisKey: args.transcriptKey },
				update: {},
				create: { redisKey: args.transcriptKey, meetingId: args.meetingId },
			});
			const transcript = new Transcript({
				meetingId: _transcript.meetingId,
				prismaClient: args.prismaClient,
				redisClient: args.redisClient,
				transcriptKey: _transcript.redisKey,
				id: _transcript.id,
			});
			return transcript;
		} catch (e) {
			console.error('Error loading/creating transcript: ', e);
			return null;
		}
	}

	public async getTranscriptRaw() {
		const result = await transcriptQueries.getTranscriptArray(this.redisClient, { transcriptKey: this.transcriptKey });

		if (!result.length) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}

		return result;
	}

	/**
	 * Get the cleaned transcript as an array of strings
	 *
	 * @returns The cleaned transcript as an array of strings
	 */
	public async getCleanedTranscript() {
		const result = await this.getTranscriptRaw();

		const cleanedTranscript = Transcript.cleanTranscript(result);

		return cleanedTranscript;
	}

	public async getRecentTranscript(limit = 5) {
		const result = await transcriptQueries.getRecentTranscriptArray(this.redisClient, {
			transcriptKey: this.transcriptKey,
			limit,
		});

		if (!result.length) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}

		return result.reverse();
	}

	public async getTranscript() {
		const result = await this.getTranscriptRaw();

		const cleanedTranscript = Transcript.cleanTranscript(result);

		// Join the cleaned strings into a single string
		const cleanedResult = cleanedTranscript.join(' ');
		return cleanedResult;
	}

	static cleanTranscript(transcriptLines: string[]) {
		// loop through the results, turning them into a single string while removing the user ID and the <timestamp> part
		const regex = /<\d+>/g;
		const cleanedArray = transcriptLines.map((str) => {
			return str
				.replaceAll(regex, '') // Remove the timestamp at the end
				.replaceAll('\n', ''); // Remove newlines
		});

		return cleanedArray;
	}

	public async appendTranscript(utterance: string, timestamp: number) {
		await transcriptQueries.appendTranscript(this.redisClient, {
			transcriptKey: this.transcriptKey,
			timestamp,
			utterance,
		});
		const tokens = countMessageTokens(Transcript.cleanTranscript([utterance])?.[0] ?? '');
		this.tokens += tokens;
		console.log(this.tokens);
	}

	public async removeUser(userId: string) {
		const rawTranscript = await this.getTranscriptRaw();

		const linesToRemove = rawTranscript.filter((line) => {
			const userIdRegex = new RegExp(`^<${userId}>`);
			return userIdRegex.test(line);
		});

		return await this.redisClient.zrem(this.transcriptKey, ...linesToRemove);
	}

	public getTranscriptKey() {
		return this.transcriptKey;
	}
}
