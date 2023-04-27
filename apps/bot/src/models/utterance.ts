import { PassThrough } from 'stream';
import { pipeline } from 'node:stream';

import type { AudioReceiveStream, VoiceReceiver } from '@discordjs/voice';
import { EndBehaviorType } from '@discordjs/voice';
import * as prism from 'prism-media';

import { deepgramPrerecordedTranscribe } from '@/services/transcriber.js';
import { formatTime } from '@/utils/transcriptUtils.js';

import type { Meeting } from './meeting.js';

// Utterance class
export class Utterance {
	private receiver: VoiceReceiver;
	private onRecordingComplete: (utterance: Utterance) => void;
	private onTranscriptionComplete: (utterance: Utterance) => void;
	private meeting: Meeting;
	public isTranscribed = false;
	public userId: string;
	public username: string;
	public audioContent: Buffer | null = null;
	public textContent: string | undefined;
	public secondsSinceStart: number;
	public timestamp: number;
	public duration: number | undefined;

	constructor(
		receiver: VoiceReceiver,
		userId: string,
		username: string,
		secondsSinceStart: number,
		onRecordingComplete: (utterance: Utterance) => void,
		onTranscriptionComplete: (utterance: Utterance) => void,
		meeting: Meeting,
	) {
		this.receiver = receiver;
		this.userId = userId;
		this.username = username;
		this.secondsSinceStart = secondsSinceStart;
		this.onRecordingComplete = onRecordingComplete;
		this.onTranscriptionComplete = onTranscriptionComplete;
		this.meeting = meeting;
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
					this.onRecordingComplete(this);
					resolve(undefined);
				}
			});
		});
	}

	async startTranscribing() {
		if (this.audioContent) {
			const keywords = [];
			const persona = this.meeting.getPersona();
			if (persona) {
				keywords.push(persona.name);
			}
			const result = await deepgramPrerecordedTranscribe(this.audioContent, keywords);
			this.textContent = result?.text;
			this.duration = result?.durationS;
			this.onTranscriptionComplete(this);
			this.isTranscribed = true;
			return true;
		} else {
			console.log('No audio content to transcribe');
			return false;
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
