import type { PrismaClient } from '@prisma/client';

import type { RedisClient } from '@/bot.js';
import { countMessageTokens } from '@/utils/tokens.js';

import type { Utterance } from './utterance.js';

type TranscriptArgs = {
	id: number;
	meetingId: number;
	redisClient: RedisClient;
	transcriptKey: string;
	prismaClient: PrismaClient;
};

type TranscriptLoadArgs = Omit<TranscriptArgs, 'id'> & {
	id?: number;
	meetingId?: number;
};

export class Transcript {
	private id: number;
	private meetingId: number;
	private prismaClient: PrismaClient;
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
		const result = await this.redisClient.zRange(this.transcriptKey, 0, -1);

		if (!result.length) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}

		const cleanedResult = Transcript.cleanTranscript(result);

		return cleanedResult;
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
		const result = await this.redisClient.set(this.transcriptKey, transcript);
		if (result === null) {
			console.log('Could not set transcript at key: ', this.transcriptKey);
		}
	}

	public async appendTranscript(utterance: string, timestamp: number) {
		const tokens = countMessageTokens(Transcript.cleanTranscript([utterance])?.[0] ?? '');
		this.tokens += tokens;
		console.log(this.tokens);
		this.redisClient.zAdd(this.transcriptKey, { score: timestamp, value: utterance });
	}

	public async addUtterance(utterance: Utterance) {
		await this.appendTranscript(utterance.formatForTranscript(), utterance.timestamp);
	}
}
