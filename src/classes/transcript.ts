import type { RedisClient } from '../bot.js';

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
		const result = await this.redisClient.get(this.transcriptKey);
		if (result === null) {
			console.log('No transcript found at key: ', this.transcriptKey);
		}
		return result;
	}

	public async setTranscript(transcript: string) {
		const result = await this.redisClient.set(this.transcriptKey, transcript);
		if (result === null) {
			console.log('Could not set transcript at key: ', this.transcriptKey);
		}
	}

	public async appendTranscript(transcript: string) {
		await this.redisClient.append(this.transcriptKey, transcript);
	}

	public async addUtterance(utterance: string, displayName: string) {
		const line = `${displayName}: ${utterance}\n`;
		await this.appendTranscript(line);
	}
}
