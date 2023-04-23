import { Readable } from 'stream';

import type { VoiceConnection } from '@discordjs/voice';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import invariant from 'tiny-invariant';

import { Config } from '@/config.js';

type TTSResult = {
	arrayBuffer: ArrayBuffer;
	audioFormat: string;
};

type ElevenLabsParams = {
	service: 'elevenlabs';
	text: string;
	apiKey: string;
	voiceId: string;
	stability?: number;
	similarity_boost?: number;
};

type AzureParams = {
	service: 'azure';
	text: string;
	apiKey: string;
};

type TTSParams = ElevenLabsParams | AzureParams;

async function textToSpeech(params: TTSParams): Promise<TTSResult> {
	switch (params.service) {
		case 'elevenlabs':
			return await getElevenLabsTTS(params);
		case 'azure':
			return await getAzureTTS(params);
		default:
			throw new Error('Invalid TTS service');
	}
}

async function getElevenLabsTTS(params: ElevenLabsParams): Promise<TTSResult> {
	const url = `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}/stream`;
	const headers = {
		'Content-Type': 'application/json',
		'xi-api-key': params.apiKey,
		accept: 'audio/mpeg',
	};

	const body = JSON.stringify({
		text: params.text,
		voice_settings: {
			stability: params.stability || 0.3,
			similarity_boost: params.similarity_boost || 0.8,
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
	return {
		arrayBuffer,
		audioFormat: 'audio/mpeg',
	};
}

const azureSpeechKey = Config.AZURE_SPEECH_KEY;
const azureSpeechRegion = Config.AZURE_SPEECH_REGION;

const azureSpeechConfig = sdk.SpeechConfig.fromSubscription(azureSpeechKey, azureSpeechRegion);

// Set the output format
azureSpeechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Ogg48Khz16BitMonoOpus;

const speechSynthesizer = new sdk.SpeechSynthesizer(azureSpeechConfig);

async function getAzureTTS(params: AzureParams): Promise<TTSResult> {
	return new Promise<TTSResult>((resolve, reject) => {
		speechSynthesizer.speakTextAsync(
			params.text,
			(result) => {
				const { audioData } = result;
				resolve({
					arrayBuffer: audioData,
					audioFormat: 'audio/ogg',
				});
			},
			(error) => {
				console.log(error);
				reject(error);
			},
		);
	});
}

export async function playArrayBuffer(
	arrayBuffer: ArrayBuffer,
	connection: VoiceConnection | undefined,
): Promise<void> {
	invariant(connection, 'No voice connection found');

	const trimDuration = 0.04; // Set this value to the desired amount of silence to trim, in seconds
	const trimBytes = Math.floor(trimDuration * 48000 * 2 * 2); // Assuming 48kHz, 16-bit audio, and 2 channels

	const trimmedArrayBuffer = arrayBuffer.slice(0, -trimBytes);
	const buffer = Buffer.from(new Uint8Array(trimmedArrayBuffer));
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

export async function playText(params: TTSParams, connection: VoiceConnection): Promise<void> {
	try {
		if (connection) {
			const ttsResult = await textToSpeech(params);
			return await playArrayBuffer(ttsResult.arrayBuffer, connection);
		} else {
			console.error('No voice connection found for the meeting');
		}
	} catch (error) {
		console.error('Error playing text to speech:', error);
	}
}

export async function getArrayBufferFromText(params: TTSParams): Promise<ArrayBuffer> {
	try {
		const ttsResult = await textToSpeech(params);
		return ttsResult.arrayBuffer;
	} catch (error) {
		console.error('Error converting text to speech:', error);
		throw error;
	}
}
