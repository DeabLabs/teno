import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { Deepgram } from '@deepgram/sdk';
import { TranscriptionQueue } from './transcriptionQueue';
import { promises as fsPromises } from 'fs';
import { Config } from './config';
import { makeTranscriptPath, transcriptionWriter } from './transcripts';
import { Transform } from 'stream';

// Replace with your file path and audio mimetype
const mimetype = 'audio/ogg';

// Initializes the Deepgram SDK
const deepgramToken = Config.get('DEEPGRAM');
const deepgram = new Deepgram(deepgramToken);
const transcriptionQueue = new TranscriptionQueue();

let transcriptFilePath = '';

export async function streamTranscribe(audioBuffer, callback, displayName) {
	const task = async () => {
		try {
			const transcription = await deepgram.transcription.preRecorded(
				{ buffer: audioBuffer, mimetype: 'audio/ogg' },
				{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
			);

			console.log(transcription.results.channels[0].alternatives[0].transcript);

			const transcriptionText = transcription.results.channels[0].alternatives[0].transcript;
			await transcriptionWriter(transcriptFilePath, transcriptionText, displayName);
			callback(null, transcriptionText);
		} catch (err) {
			console.log(err);
		}
	};
	await transcriptionQueue.add(task);
}

export async function downloadTranscribe(filePath, displayName) {
	const task = async () => {
		try {
			const transcription = await deepgram.transcription.preRecorded(
				{ buffer: readFileSync(filePath), mimetype: 'audio/ogg' },
				{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
			);
			deleteRecording(filePath);
			const transcriptionText = transcription.results.channels[0].alternatives[0].transcript;
			console.log(transcriptionText);
			if (transcriptionText.length > 0) {
				await transcriptionWriter(transcriptFilePath, transcriptionText, displayName);
			}
		} catch (err) {
			console.log(err);
		}
	};
	await transcriptionQueue.add(task);
}

export function createTranscribeStream(displayName) {
	return new Transform({
		objectMode: true,
		async transform(audioBuffer, encoding, callback) {
			streamTranscribe(Buffer.from(audioBuffer), callback, displayName);
		},
	});
}

function deleteRecording(filePath) {
	try {
		unlinkSync(filePath);
		console.log('File removed:', filePath);
	} catch (err) {
		console.error(err);
	}
}

export function createFile(channelId) {
	const timestamp = Date.now();

	transcriptFilePath = makeTranscriptPath(timestamp.toString(), channelId);

	const content = '[Beginning of Transcript]';
	transcriptionWriter(transcriptFilePath, content);
}
