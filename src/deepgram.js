import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { Deepgram } from '@deepgram/sdk';
import { config } from 'dotenv';
config({ path: '../.env' });
import { TranscriptionQueue } from './transcriptionQueue';
import { promises as fsPromises } from 'fs';

const { deepgram_token } = require('./config.json'); //as { deepgram_token };

// The API key we created in step 3
//const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

// Replace with your file path and audio mimetype
const mimetype = 'audio/ogg';

// Initializes the Deepgram SDK
const deepgram = new Deepgram(deepgram_token);
const transcriptionQueue = new TranscriptionQueue();

let transcriptFilePath = '';

async function writeTranscriptionToFile(transcriptionText, fileName) {
	try {
		await fsPromises.appendFile(fileName, transcriptionText + '\n', 'utf-8');
		console.log(`Transcription appended to file: ${fileName}`);
	} catch (error) {
		console.error(`Error appending transcription to file: ${error.message}`);
	}
}

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
			await writeTranscriptionToFile(transcriptionText, transcriptFilePath);
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

	transcriptFilePath = `./transcripts/${timestamp}-${userId}.txt`;

	const content = '[Beginning of Transcript]';
	writeFileSync(transcriptFilePath, content);
}
