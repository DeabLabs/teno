import type { RedisClient } from './bot.js';
import type { Utterance } from './utterance.js';

export class Transcript {
	private redisClient: RedisClient;
	public transcriptKey: string;

	constructor(redisClient: RedisClient, transcriptKey: string) {
		this.redisClient = redisClient;
		this.transcriptKey = transcriptKey;

		this.appendTranscript = this.appendTranscript.bind(this);
		this.addUtterance = this.addUtterance.bind(this);
		this.getTranscript = this.getTranscript.bind(this);
		this.setTranscript = this.setTranscript.bind(this);
	}

	public async getTranscript() {
		const result = await this.redisClient.zRange(this.transcriptKey, 0, -1);

		if (!result.length) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}
		// loop through the results, turning them into a single string while removing the <timestamp> part
		const timestampRegex = /<\d+>$/;
		const cleanedArray = result.map((str) => str.replace(timestampRegex, ''));

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
	}
}
