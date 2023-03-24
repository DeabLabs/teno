import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { Deepgram } from '@deepgram/sdk';
import { TranscriptionQueue } from './transcriptionQueue';
import { promises as fsPromises } from 'fs';
import { Config } from './config';
import { makeTranscriptPath, transcriptionWriter } from './transcripts';

// Replace with your file path and audio mimetype
const mimetype = 'audio/ogg';

// Initializes the Deepgram SDK
const deepgramToken = Config.get('DEEPGRAM');
const deepgram = new Deepgram(deepgramToken);
const transcriptionQueue = new TranscriptionQueue();

let transcriptFilePath = '';

export async function transcribe(filePath) {
	const task = async () => {
		try {
			const transcription = await deepgram.transcription.preRecorded(
				{ buffer: readFileSync(filePath), mimetype: 'audio/ogg' },
				{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
			);

			console.log(transcription.results.channels[0].alternatives[0].transcript);
			deleteRecording(filePath);

			const transcriptionText = transcription.results.channels[0].alternatives[0].transcript;
			await transcriptionWriter(transcriptFilePath, transcriptionText);
		} catch (err) {
			console.log(err);
		}
	};
	await transcriptionQueue.add(task);

	// deepgram.transcription
	// 	.preRecorded(
	// 		{ buffer: readFileSync(filePath), mimetype },
	// 		{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
	// 	)
	// 	.then(async (transcription) => {
	// 		//console.dir(transcription, { depth: null });
	// 		console.log(transcription.results.channels[0].alternatives[0].transcript);
	// 		deleteRecording(filePath);

	// 		const transcriptionText = transcription.results.channels[0].alternatives[0].transcript;
	// 		const outputFileName = `transcriptions/transcription.txt`; // Changed to a constant filename
	// 		await writeTranscriptionToFile(transcriptionText, outputFileName);
	// 	})
	// 	.catch((err) => {
	// 		console.log(err);
	// 	});
	// await transcriptionQueue.add(task);
}

function deleteRecording(filePath) {
	try {
		unlinkSync(filePath);
		console.log('File removed:', filePath);
	} catch (err) {
		console.error(err);
	}
}

export function createFile(userId) {
	const timestamp = Date.now();

	transcriptFilePath = makeTranscriptPath(timestamp.toString(), userId);

	const content = '[Beginning of Transcript]';
	transcriptionWriter(transcriptFilePath, content);
}
