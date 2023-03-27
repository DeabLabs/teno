import { readFileSync, unlinkSync } from 'fs';
// import { Transform } from 'stream';
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

// export async function streamTranscribe(audioBuffer: Buffer, callback: any, displayName: string) {
// 	const task = async () => {
// 		try {
// 			const transcription = await deepgram.transcription.preRecorded(
// 				{ buffer: audioBuffer, mimetype },
// 				{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
// 			);

// 			console.log(transcription.results?.channels[0]?.alternatives[0]?.transcript);

// 			const transcriptionText = transcription.results?.channels[0]?.alternatives[0]?.transcript;
// 			if (transcriptionText) {
// 				await transcriptionWriter(transcriptFilePath, transcriptionText, displayName);
// 			}
// 			callback(null, transcriptionText);
// 		} catch (err) {
// 			console.log(err);
// 		}
// 	};
// 	await transcriptionQueue.add(task);
// }

export async function downloadTranscribe(filePath: string, displayName: string) {
	const task = async () => {
		try {
			const transcription = await deepgram.transcription.preRecorded(
				{ buffer: readFileSync(filePath), mimetype },
				{ punctuate: true, model: 'general', language: 'en-US', tier: 'enhanced' },
			);
			deleteRecording(filePath);
			const transcriptionText = transcription.results?.channels[0]?.alternatives[0]?.transcript;
			console.log(transcriptionText);
			if (transcriptionText) {
				await transcriptionWriter(transcriptFilePath, transcriptionText, displayName);
			}
		} catch (err) {
			console.log(err);
		}
	};
	await transcriptionQueue.add(task);
}

// export function createTranscribeStream(displayName: string) {
// 	return new Transform({
// 		objectMode: true,
// 		transform(audioBuffer, encoding, callback) {
// 			void streamTranscribe(audioBuffer, callback, displayName);
// 		},
// 	});
// }

function deleteRecording(filePath: string) {
	try {
		unlinkSync(filePath);
	} catch (err) {
		console.error(err);
	}
}

export async function createFile(channelId: string) {
	const timestamp = Date.now();

	transcriptFilePath = makeTranscriptPath(timestamp.toString(), channelId);

	const content = '[Beginning of Transcript]';
	await transcriptionWriter(transcriptFilePath, content, '');
	return transcriptFilePath;
}
