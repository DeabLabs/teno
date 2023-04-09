import type { PrismaClientType } from 'database';
import { transcriptQueries } from 'kv';

import type { RedisClient } from '@/bot.js';
import { countMessageTokens } from '@/utils/tokens.js';

import type { Utterance } from './utterance.js';

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
		this.addUtterance = this.addUtterance.bind(this);
		this.getTranscript = this.getTranscript.bind(this);
		this.setTranscript = this.setTranscript.bind(this);
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

	public async getTranscript() {
		const result = await this.getTranscriptRaw();

		const cleanedTranscript = Transcript.cleanTranscript(result);

		// Join the cleaned strings into a single string
		const cleanedResult = cleanedTranscript.join(' ');
		return cleanedResult;
	}

	static cleanTranscript(transcriptLines: string[]) {
		// loop through the results, turning them into a single string while removing the <timestamp> part
		const timestampRegex = /<\d+>/g;
		const cleanedArray = transcriptLines.map((str) => str.replaceAll(timestampRegex, '').replaceAll('\n', ''));

		return cleanedArray;
	}

	public async setTranscript(transcript: string) {
		return transcriptQueries.setTranscript(this.redisClient, { transcriptKey: this.transcriptKey, transcript });
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

	public async addUtterance(utterance: Utterance) {
		await this.appendTranscript(utterance.formatForTranscript(), utterance.timestamp);
	}
}
