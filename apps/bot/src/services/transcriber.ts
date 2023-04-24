import DeepgramPkg from '@deepgram/sdk';

import { Config } from '@/config.js';

const { Deepgram } = DeepgramPkg;

// Replace with your file path and audio mimetype
const mimetype = 'audio/ogg';

// Initializes the Deepgram SDK
const deepgramToken = Config.DEEPGRAM;
const deepgram = new Deepgram(deepgramToken);

export async function deepgramPrerecordedTranscribe(audioBuffer: Buffer): Promise<
	| {
			text: string;
			durationS: number;
	  }
	| undefined
> {
	if (!audioBuffer.length) {
		console.log('No audio buffer to transcribe, skipping');
		return undefined;
	}
	try {
		const response = await deepgram.transcription.preRecorded(
			{ buffer: audioBuffer, mimetype },
			{ punctuate: true, model: 'general', language: 'en-US', tier: 'nova', keywords: ['Teno', 'stop'] },
		);
		// Return transcription as continuous string
		const resultText = response.results?.channels[0]?.alternatives[0]?.transcript;
		if (resultText) {
			return { text: resultText, durationS: response.metadata?.duration || 0 };
		} else {
			return undefined;
		}
	} catch (err) {
		console.log('Deepgram error', err);
		return undefined;
	}
}
