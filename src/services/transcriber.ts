import DeepgramPkg from '@deepgram/sdk';
import { Config } from '../config.js';

const { Deepgram } = DeepgramPkg;

// Replace with your file path and audio mimetype
const mimetype = 'audio/ogg';

// Initializes the Deepgram SDK
const deepgramToken = Config.DEEPGRAM;
const deepgram = new Deepgram(deepgramToken);

export async function deepgramPrerecordedTranscribe(audioBuffer: Buffer): Promise<string | undefined> {
	if (!audioBuffer.length) {
		console.log('No audio buffer to transcribe, skipping');
		return undefined;
	}
	try {
		const response = await deepgram.transcription.preRecorded(
			{ buffer: audioBuffer, mimetype },
			{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
		);
		// Return transcription as continuous string
		const result = response.results?.channels[0]?.alternatives[0]?.transcript;
		if (result) {
			return result;
		} else {
			return undefined;
		}
	} catch (err) {
		console.log('Deepgram error', err);
		return undefined;
	}
}
