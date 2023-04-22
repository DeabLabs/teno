import { Readable } from 'stream';

import type { VoiceConnection } from '@discordjs/voice';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import opus from '@discordjs/opus';

import { Config } from '@/config.js';

const { OpusEncoder } = opus;

type TTSResult = {
	arrayBuffer: ArrayBuffer;
	audioFormat: string;
};

type ElevenLabsParams = {
	connection: VoiceConnection | undefined;
	text: string;
	service: 'elevenlabs';
	apiKey: string;
	voiceId: string;
	stability?: number;
	similarity_boost?: number;
};

type AzureParams = {
	connection: VoiceConnection | undefined;
	text: string;
	service: 'azure';
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

async function playAudioBuffer(
	arrayBuffer: ArrayBuffer,
	audioFormat: string,
	connection: VoiceConnection,
): Promise<void> {
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

export async function playTextToSpeech(params: TTSParams): Promise<void> {
	try {
		if (params.connection) {
			const ttsResult = await textToSpeech(params);
			await playAudioBuffer(ttsResult.arrayBuffer, ttsResult.audioFormat, params.connection);
		} else {
			console.error('No voice connection found for the meeting');
		}
	} catch (error) {
		console.error('Error playing text to speech:', error);
	}
}
