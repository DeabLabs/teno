import { AudioPlayer, createAudioPlayer } from '@discordjs/voice';
import type { VoiceService } from 'database';
import type { Observable } from 'rxjs';
import { from } from 'rxjs';
import { Subject } from 'rxjs';
import {
	scan,
	switchScan,
	filter,
	map,
	mergeMap,
	toArray,
	mergeAll,
	tap,
	buffer,
	flatMap,
	switchMap,
} from 'rxjs/operators';

import { getArrayBufferFromText, playArrayBuffer, playFilePath } from '@/services/textToSpeech.js';
import type { TTSParams } from '@/services/textToSpeech.js';
import { endTalkingBoops } from '@/services/audioResources.js';

import type { Teno } from './teno.js';
import type { Meeting } from './meeting.js';

interface Accumulator {
	sentences: string[];
	current: string;
	bufferedToken: string | null;
}

export class VoicePipeline {
	private tokens$ = new Subject<string>();
	private teno: Teno;
	private meeting: Meeting;
	private onEnd: () => void;

	constructor({ teno, meeting, onEnd }: { teno: Teno; meeting: Meeting; onEnd: () => void }) {
		this.teno = teno;
		this.meeting = meeting;
		this.onEnd = onEnd;

		this.playAudioBuffer = this.playAudioBuffer.bind(this);
		this.createAudioBufferFromSentence = this.createAudioBufferFromSentence.bind(this);

		this.createSentencesStream();
		// this.processAndPlaySentences(sentences$);
	}

	public getAudioPlayer() {
		return createAudioPlayer();
	}

	private createSentencesStream() {
		const { createAudioBufferFromSentence, playAudioBuffer } = this;

		const splitTokens = ['.', '?', '!', ':', ';'];
		const sentences$ = this.tokens$.pipe(
			// Accumulate tokens until an end character is found
			buffer(
				this.tokens$.pipe(
					filter((token: string) => {
						return splitTokens.some((splitToken) => token.includes(splitToken));
					}),
				),
			),

			// Process the tokens and emit the sentences
			map((sentence) => {
				return sentence.join('');
			}),
			filter((s) => !!s),
			switchMap(async (sentence) => {
				console.log('Playing sentence', sentence);
				const audioBuffer = await createAudioBufferFromSentence(sentence);
				if (audioBuffer) {
					return await playAudioBuffer(audioBuffer, 'azure'); // Replace 'azure' with the appropriate service
				}
			}),
		);
		return sentences$.subscribe({
			error: (err) => console.error(`Error: ${err}`),
			complete: () => {
				this.onEnd();
				playFilePath(this.getAudioPlayer(), endTalkingBoops(), this.meeting.getConnection());
				console.log('complete');
			},
		});
	}

	private processAndPlaySentences(sentences$: Observable<string>) {
		const subscription = sentences$;
	}

	// Function to convert sentences to audio buffers
	private async createAudioBufferFromSentence(sentence: string): Promise<ArrayBuffer | null> {
		const vConfig = this.getCachedVoiceConfig();
		const service = vConfig?.service;
		if (vConfig) {
			try {
				switch (service) {
					case 'azure':
						return await getArrayBufferFromText({
							service,
							apiKey: vConfig.apiKey,
							text: sentence,
						});
					case 'elevenlabs':
						return await getArrayBufferFromText({
							service,
							apiKey: vConfig.apiKey,
							text: sentence,
							voiceId: vConfig.voiceKey,
						});
					default:
						throw new Error('Invalid voice service');
				}
			} catch (error) {
				console.error('Error converting text to speech:', error);
			}
		}
		return null;
	}

	private async playAudioBuffer(audioBuffer: ArrayBuffer, service: TTSParams['service']): Promise<void> {
		const vConfig = this.getCachedVoiceConfig();
		if (vConfig) {
			try {
				await playArrayBuffer(this.getAudioPlayer(), audioBuffer, this.meeting.getConnection(), service);
			} catch (error) {
				console.error('Error playing audio:', error);
			}
		}
		return;
	}

	// Function to simulate receiving tokens from the LLM
	onNewToken = (token: string) => {
		this.tokens$.next(token);
	};

	// Function to complete the tokens$ Subject when you're done
	complete = () => {
		this.tokens$.complete();
	};

	public getCachedVoiceConfig() {
		return this.teno.getVoiceService() as Omit<VoiceService, 'service'> & { service: 'azure' | 'elevenlabs' };
	}
}
