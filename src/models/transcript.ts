import type { PrismaClient } from '@prisma/client';
import type { Collection } from 'chromadb';
import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from 'chromadb';

import { countStringTokens } from '@/services/langchain.js';
import type { RedisClient } from '@/bot.js';
import { Config } from '@/config.js';

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
	private chromaCollection: Collection | undefined;
	private embeddingFunction: OpenAIEmbeddingFunction | undefined;
	private lineCounter: number;
	private chromaClient: ChromaClient | undefined;

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

		this.lineCounter = 0;
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
			transcript.initializeChroma();
			return transcript;
		} catch (e) {
			console.error('Error loading/creating transcript: ', e);
			return null;
		}
	}

	private async initializeChroma() {
		try {
			this.chromaClient = new ChromaClient();
			this.embeddingFunction = new OpenAIEmbeddingFunction(Config.OPENAI_API_KEY);
			this.chromaCollection = await this.chromaClient.createCollection(this.transcriptKey, {}, this.embeddingFunction);
		} catch (error) {
			console.error('Error initializing Chroma collection:', error);
		}
	}

	public async getTranscript() {
		const result = await this.redisClient.zRange(this.transcriptKey, 0, -1);

		if (!result.length) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}
		// loop through the results, turning them into a single string while removing the <timestamp> part
		const timestampRegex = /<\d+>/g;
		const cleanedArray = result.map((str) => str.replaceAll(timestampRegex, ''));

		// Join the cleaned strings into a single string
		const cleanedResult = cleanedArray.join(' ');
		return cleanedResult;
	}

	public async setTranscript(transcript: string) {
		const result = await this.redisClient.set(this.transcriptKey, transcript);
		if (result === null) {
			console.log('Could not set transcript at key: ', this.transcriptKey);
		}
	}

	public async appendTranscript(utterance: string, timestamp: number) {
		this.redisClient.zAdd(this.transcriptKey, { score: timestamp, value: utterance });
	}

	public async addUtterance(utterance: Utterance) {
		await this.appendTranscript(utterance.formatForTranscript(), utterance.timestamp);
		console.log(countStringTokens(await this.getTranscript()));

		// Increment the line counter
		this.lineCounter++;

		// If the lineCounter reaches the desired number, create a new chunk
		const chunkSize = 5;
		const overlap = 2;
		if (this.lineCounter >= chunkSize) {
			// Create a new chunk and add it to the vector database
			const newChunk = await this.createChunk(chunkSize, overlap);

			if (this.chromaCollection) {
				await this.chromaCollection.add([Date.now().toString()], undefined, undefined, [newChunk]);
			}

			// Reset the lineCounter
			this.lineCounter = overlap;
		}
	}
	createChunks(lines: string[], chunkSize: number, overlap: number) {
		const chunks = [];
		for (let i = 0; i < lines.length - chunkSize + 1; i += chunkSize - overlap) {
			chunks.push(lines.slice(i, i + chunkSize).join('\n'));
		}
		return chunks;
	}

	async createChunk(chunkSize: number, overlap: number) {
		const transcript = await this.getTranscript();
		const lines = transcript.split('\n');
		const startIndex = Math.max(lines.length - chunkSize - overlap + 1, 0);
		const lastChunk = lines.slice(startIndex, startIndex + chunkSize).join('\n');
		console.log('Chunk:\n', lastChunk);
		return lastChunk;
	}

	public getCollection() {
		return this.chromaCollection;
	}

	// async runLangchainQuery(vectordb: any, query: any) {
	// 	const qa = VectorDBQA.from_chain_type((llm = OpenAI()), (chain_type = 'stuff'), (vectorstore = vectordb));
	// 	return qa.run(query);
	// }
}
