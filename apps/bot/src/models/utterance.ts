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
	private onRecordingComplete: (utterance: Utterance) => void;
	private onTranscriptionComplete: (utterance: Utterance) => void;
	public isTranscribed = false;
	public userId: string;
	public username: string;
	public audioContent: Buffer | null = null;
	public textContent: string | undefined;
	public secondsSinceStart: number;
	public timestamp: number;

	constructor(
		receiver: VoiceReceiver,
		userId: string,
		username: string,
		secondsSinceStart: number,
		onRecordingComplete: (utterance: Utterance) => void,
		onTranscriptionComplete: (utterance: Utterance) => void,
	) {
		this.receiver = receiver;
		this.userId = userId;
		this.username = username;
		this.secondsSinceStart = secondsSinceStart;
		this.onRecordingComplete = onRecordingComplete;
		this.onTranscriptionComplete = onTranscriptionComplete;

		this.timestamp = Date.now();
	}

	public async process() {
		try {
			const [opusStream, oggStream] = await this.createListeningStream(this.receiver);
			await this.downloadRecording(opusStream, oggStream);
			await this.startTranscribing();
		} catch (err) {
			console.error(err);
		}
	}

	private async createListeningStream(receiver: VoiceReceiver) {
		const opusStream = receiver.subscribe(this.userId, {
			end: {
				behavior: EndBehaviorType.AfterSilence,
				duration: 1000,
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
					this.onRecordingComplete(this);
					resolve(undefined);
				}
			});
		});
	}

	async startTranscribing() {
		if (this.audioContent) {
			this.textContent = await deepgramPrerecordedTranscribe(this.audioContent);
			this.onTranscriptionComplete(this);
			this.isTranscribed = true;
			return true;
		} else {
			console.log('No audio content to transcribe');
			return false;
		}
	}

	public formatForTranscript(): string {
		return `${this.username} (${formatTime(this.secondsSinceStart)}): ${this.textContent}<${this.timestamp}>\n`;
	}
}
