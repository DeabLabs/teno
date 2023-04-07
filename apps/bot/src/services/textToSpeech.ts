import { Readable } from 'stream';

import type { VoiceConnection } from '@discordjs/voice';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource } from '@discordjs/voice';

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

export async function playTextToSpeech(connection: VoiceConnection | undefined, text: string): Promise<void> {
	const defaultVoiceId = 'WSS2tQv38AU3q7jpFVPd'; // Replace with the default Voice ID you want to use
	const defaultStability = 0.3;
	const defaultSimilarityBoost = 0.8;

	const apiKey = Config.ELEVENLABS_API_KEY;
	if (!apiKey) {
		throw new Error('ELEVENLABS_API_KEY is not set in the configuration');
	}
	try {
		if (connection) {
			const buffer = await textToSpeech(defaultVoiceId, text, apiKey, defaultStability, defaultSimilarityBoost);
			await playAudioBuffer(buffer, connection);
		} else {
			console.error('No voice connection found for the meeting');
		}
	} catch (error) {
		console.error('Error error playing text to speech:', error);
	}
}
