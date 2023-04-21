import { Readable } from 'stream';
import { PassThrough } from 'stream';

import type { VoiceConnection } from '@discordjs/voice';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import invariant from 'tiny-invariant';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

import { Config } from '@/config.js';

export async function textToSpeech(
	voiceId: string,
	text: string,
	apiKey: string,
	stability: number,
	similarity_boost: number,
): Promise<ArrayBuffer> {
	const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
	const headers = {
		'Content-Type': 'application/json',
		'xi-api-key': apiKey,
		accept: 'audio/mpeg',
	};

	const body = JSON.stringify({
		text,
		voice_settings: {
			stability,
			similarity_boost,
		},
	});

	const response = await fetch(url, {
		method: 'POST',
		headers: headers,
		body: body,
	});

	if (!response.ok) {
		throw new Error(`API request failed: ${response.status} ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	return arrayBuffer;
}

export async function playAudioBuffer(arrayBuffer: ArrayBuffer, connection: VoiceConnection): Promise<void> {
	const buffer = Buffer.from(new Uint8Array(arrayBuffer));
	const bufferStream = Readable.from(buffer);
	const audioResource = createAudioResource(bufferStream);
	const audioPlayer = createAudioPlayer();

	audioPlayer.play(audioResource);
	connection.subscribe(audioPlayer);

	return new Promise((resolve, reject) => {
		audioPlayer.on(AudioPlayerStatus.Idle, () => {
			resolve();
		});

		audioPlayer.on('error', (error) => {
			console.error('Error while playing audio:', error);
			reject(error);
		});
	});
}

export async function playTextToSpeech({
	connection,
	text,
	apiKey,
	voiceId,
}: {
	apiKey: string;
	voiceId: string;
	connection: VoiceConnection | undefined;
	text: string;
}): Promise<void> {
	const defaultStability = 0.3;
	const defaultSimilarityBoost = 0.8;

	invariant(apiKey, 'Eleven labs API key is required');
	invariant(voiceId, 'Eleven labs voice ID is required');

	try {
		if (connection) {
			//const buffer = await textToSpeech(voiceId, text, apiKey, defaultStability, defaultSimilarityBoost);
			const buffer = await synthesizeSpeech(text);
			await playAudioBuffer(buffer, connection);
		} else {
			console.error('No voice connection found for the meeting');
		}
	} catch (error) {
		console.error('Error error playing text to speech:', error);
	}
}

const speechKey = Config.SPEECH_KEY;
const speechRegion = Config.SPEECH_REGION;

const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);

// Set the output format
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Ogg48Khz16BitMonoOpus;

const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig);

function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
	return new Promise<ArrayBuffer>((resolve, reject) => {
		speechSynthesizer.speakTextAsync(
			text,
			(result) => {
				const { audioData } = result;
				resolve(audioData);
			},
			(error) => {
				console.log(error);
				reject(error);
			},
		);
	});
}
