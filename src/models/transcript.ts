import type { PrismaClient } from '@prisma/client';

import type { RedisClient } from '@/bot.js';
import { cleanDialogue } from '@/services/langchain.js';

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
	private numberOfUncleanedLines: number;

	private constructor({ redisClient, transcriptKey, prismaClient, meetingId, id }: TranscriptArgs) {
		this.redisClient = redisClient;
		this.transcriptKey = transcriptKey;
		this.prismaClient = prismaClient;
		this.meetingId = meetingId;
		this.id = id;
		this.numberOfUncleanedLines = 0;

		// Bind methods
		this.appendUtteranceToTranscript = this.appendUtteranceToTranscript.bind(this);
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

	// public async getTranscript() {
	// 	const result = await this.redisClient.zRange(this.transcriptKey, 0, -1);

	// 	if (!result.length) {
	// 		console.log('No transcript found at key: ', this.transcriptKey);
	// 	}
	// 	// loop through the results, turning them into a single string while removing the <timestamp> part
	// 	const timestampRegex = /<\d+>/g;
	// 	const cleanedArray = result.map((str) => str.replaceAll(timestampRegex, ''));

	// 	// Join the cleaned strings into a single string
	// 	const cleanedResult = cleanedArray.join(' ');
	// 	return cleanedResult;
	// }

	public async getTranscript() {
		// Fetch the entire transcript using zRange
		const result = await this.redisClient.zRange(this.transcriptKey, 0, -1);

		if (!result.length) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}
		// Loop through the results, turning them into a single string while removing the <timestamp> part
		const timestampRegex = /<\d+>/g;
		const cleanedArray = result.map((str) => str.replaceAll(timestampRegex, ''));

		// Join the cleaned strings into a single string
		const cleanedResult = cleanedArray.join(' ');
		return cleanedResult;
	}

	public async appendArrayToTranscript(lines: string[], startIndex: number) {
		// Remove the old lines before appending the new cleaned lines
		await this.redisClient.zRemRangeByRank(this.transcriptKey, startIndex, startIndex + lines.length - 1);

		let index = startIndex;
		for (const line of lines) {
			this.redisClient.zAdd(this.transcriptKey, { score: index, value: line });
			index++;
		}
	}

	public async cleanTranscript(proprietaryTerms: string[] = []) {
		const cleanedLinesOverlap = 6;
		const uncleanedLinesCount = 6;

		const lastCleanedLines = await this.getLastCleanedLines(cleanedLinesOverlap);
		const lastUncleanedLines = await this.getLastUncleanedLines();

		const cleanedTextArray = await cleanDialogue(lastCleanedLines, lastUncleanedLines, proprietaryTerms);

		// Calculate the number of lines that need to be replaced in the transcript
		const overlapLinesToReplace = Math.min(cleanedLinesOverlap, this.numberOfUncleanedLines);

		// Append the cleaned lines to the transcript
		const cleanedLinesToAppend = cleanedTextArray.slice(-uncleanedLinesCount);
		await this.appendArrayToTranscript(cleanedLinesToAppend, this.numberOfUncleanedLines - overlapLinesToReplace);

		// Log the cleaning results
		console.log('Cleaning results:');
		console.log('Last cleaned lines:', lastCleanedLines);
		console.log('Last uncleaned lines:', lastUncleanedLines);
		console.log('Cleaned text array:', cleanedTextArray);
		console.log('Cleaned lines to append:', cleanedLinesToAppend);
	}

	public async setTranscript(transcript: string) {
		const result = await this.redisClient.set(this.transcriptKey, transcript);
		if (result === null) {
			console.log('Could not set transcript at key: ', this.transcriptKey);
		}
	}

	public async appendUtteranceToTranscript(utterance: string, timestamp: number) {
		this.redisClient.zAdd(this.transcriptKey, { score: timestamp, value: utterance });
	}

	public async addUtterance(utterance: Utterance) {
		await this.appendUtteranceToTranscript(utterance.formatForTranscript(), utterance.timestamp);
		this.numberOfUncleanedLines += 1;

		// Define the threshold for the number of uncleaned lines before running the cleaning function
		const cleaningThreshold = 6;

		if (this.numberOfUncleanedLines >= cleaningThreshold) {
			await this.cleanTranscript();
			this.numberOfUncleanedLines = 0; // Reset the counter after cleaning
		}
	}

	public async getLastCleanedLines(cleanedLinesOverlap: number) {
		const start = Math.max(0, this.numberOfUncleanedLines - cleanedLinesOverlap);
		const end = this.numberOfUncleanedLines - 1;

		const result = await this.redisClient.zRange(this.transcriptKey, start, end);

		return result.map((str) => str.replaceAll(/<\d+>/g, ''));
	}

	public async getLastUncleanedLines() {
		const result = await this.redisClient.zRange(this.transcriptKey, this.numberOfUncleanedLines, -1);

		return result.map((str) => str.replaceAll(/<\d+>/g, ''));
	}
}
