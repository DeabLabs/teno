import { PassThrough } from 'stream';
import { pipeline } from 'node:stream';

import type { AudioReceiveStream, VoiceReceiver } from '@discordjs/voice';
import { EndBehaviorType } from '@discordjs/voice';
import * as prism from 'prism-media';

import { deepgramPrerecordedTranscribe } from '@/services/transcriber.js';
import { formatTime } from '@/utils/transcriptUtils.js';

// Utterance class
export class Utterance {
	private receiver: VoiceReceiver;
	public isTranscribed = false;
	public userId: string;
	public username: string;
	public audioContent: Buffer | null = null;
	public textContent: string | undefined;
	public secondsSinceStart: number;
	public timestamp: number;
	public duration: number | undefined;

	constructor(receiver: VoiceReceiver, userId: string, username: string, secondsSinceStart: number) {
		this.receiver = receiver;
		this.userId = userId;
		this.username = username;
		this.secondsSinceStart = secondsSinceStart;

		this.timestamp = Date.now();
	}

	public async process() {
		try {
			const [opusStream, oggStream] = await this.createListeningStream(this.receiver);
			await this.downloadRecording(opusStream, oggStream);
			return await this.startTranscribing();
		} catch (err) {
			console.error(err);
			return null;
		}
	}

	private async createListeningStream(receiver: VoiceReceiver) {
		const opusStream = receiver.subscribe(this.userId, {
			end: {
				behavior: EndBehaviorType.AfterSilence,
				duration: 500,
			},
		});

		const oggStream = new prism.opus.OggLogicalBitstream({
			opusHead: new prism.opus.OpusHead({
				channelCount: 2,
				sampleRate: 48000,
			}),
			pageSizeControl: {
				maxPackets: 10,
			},
		});
		return [opusStream, oggStream] as const;
	}

	private async downloadRecording(opusStream: AudioReceiveStream, oggStream: prism.opus.OggLogicalBitstream) {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			const passThrough = new PassThrough();

			passThrough.on('data', (chunk) => {
				chunks.push(chunk);
			});

			pipeline(opusStream, oggStream, passThrough, async (err) => {
				if (err) {
					console.warn(`❌ Error recording - ${err.message}`);
					reject(err);
				} else {
					this.audioContent = Buffer.concat(chunks);
					resolve(undefined);
				}
			});
		});
	}

	async startTranscribing() {
		if (this.audioContent) {
			const result = await deepgramPrerecordedTranscribe(this.audioContent);

			if (!result) {
				return null;
			}

			if (result === 'STOP') {
				return 'STOP';
			}

			this.textContent = result?.text;
			this.duration = result?.durationS;
			this.isTranscribed = true;

			return this;
		} else {
			console.log('No audio content to transcribe');
			return null;
		}
	}

	static createTranscriptLine(
		username: string,
		userId: string,
		content: string,
		secondsSinceStart: number,
		timestamp: number,
	): string {
		return `<${userId}>${username} (${formatTime(secondsSinceStart)}): ${content}<${timestamp}>\n`;
	}

	public formatForTranscript() {
		if (!this.textContent) {
			return;
		}

		return Utterance.createTranscriptLine(
			this.username,
			this.userId,
			this.textContent,
			this.secondsSinceStart,
			this.timestamp,
		);
	}
}
