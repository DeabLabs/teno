import DeepgramPkg from '@deepgram/sdk';
import { Config } from './config.js';
import { TranscriptionQueue } from './transcriptionQueue.js';
import { makeTranscriptPath, transcriptionWriter } from './transcripts.js';

const { Deepgram } = DeepgramPkg;

// Replace with your file path and audio mimetype
const mimetype = 'audio/ogg';

// Initializes the Deepgram SDK
const deepgramToken = Config.DEEPGRAM;
const deepgram = new Deepgram(deepgramToken);
const transcriptionQueue = new TranscriptionQueue();

let transcriptFilePath = '';

export async function streamTranscribe(audioBuffer: Buffer, displayName: string) {
	const task = async () => {
		try {
			const transcription = await deepgram.transcription.preRecorded(
				{ buffer: audioBuffer, mimetype },
				{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
			);

			const transcriptionText = transcription.results?.channels[0]?.alternatives[0]?.transcript;

			if (transcriptionText) {
				console.log(transcriptionText);
				await transcriptionWriter(transcriptFilePath, transcriptionText, displayName);
			} else {
				console.log('No transcription text from deepgram');
			}
		} catch (err) {
			console.log(err);
		}
	};

	if (!audioBuffer.length) {
		console.log('No audio buffer to transcribe, skipping');
		return;
	}

	await transcriptionQueue.add(task);
}

export async function createFile(channelId: string) {
	const timestamp = Date.now();

	transcriptFilePath = makeTranscriptPath(timestamp.toString(), channelId);

	const content = '[Beginning of Transcript]';
	await transcriptionWriter(transcriptFilePath, content, '');
	return transcriptFilePath;
}
