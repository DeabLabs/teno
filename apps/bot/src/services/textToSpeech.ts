import { Readable } from 'stream';

import type { VoiceConnection, AudioPlayer, AudioResource } from '@discordjs/voice';
import { AudioPlayerStatus, createAudioResource } from '@discordjs/voice';
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

export type TTSParams = ElevenLabsParams | AzureParams;

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

const azureSpeechRegion = Config.AZURE_SPEECH_REGION;

// English (Australia)	en-AU-AnnetteNeural (Female)
// en-AU-CarlyNeural (Female)
// en-AU-DarrenNeural (Male)
// en-AU-DuncanNeural (Male)
// en-AU-ElsieNeural (Female)
// en-AU-FreyaNeural (Female)
// en-AU-JoanneNeural (Female)
// en-AU-KenNeural (Male)
// en-AU-KimNeural (Female)
// en-AU-NatashaNeural (Female)
// en-AU-NeilNeural (Male)
// en-AU-TimNeural (Male)
// en-AU-TinaNeural (Female)
// en-AU-WilliamNeural (Male)
// en-CA	English (Canada)	en-CA-ClaraNeural (Female)
// en-CA-LiamNeural (Male)
// en-GB	English (United Kingdom)	en-GB-AbbiNeural (Female)
// en-GB-AlfieNeural (Male)
// en-GB-BellaNeural (Female)
// en-GB-ElliotNeural (Male)
// en-GB-EthanNeural (Male)
// en-GB-HollieNeural (Female)
// en-GB-LibbyNeural (Female)
// en-GB-MaisieNeural (Female, Child)
// en-GB-NoahNeural (Male)
// en-GB-OliverNeural (Male)
// en-GB-OliviaNeural (Female)
// en-GB-RyanNeural (Male)
// en-GB-SoniaNeural (Female)
// en-GB-ThomasNeural (Male)
// en-HK	English (Hong Kong SAR)	en-HK-SamNeural (Male)
// en-HK-YanNeural (Female)
// en-IE	English (Ireland)	en-IE-ConnorNeural (Male)
// en-IE-EmilyNeural (Female)
// en-IN	English (India)	en-IN-NeerjaNeural (Female)
// en-IN-PrabhatNeural (Male)
// en-KE	English (Kenya)	en-KE-AsiliaNeural (Female)
// en-KE-ChilembaNeural (Male)
// en-NG	English (Nigeria)	en-NG-AbeoNeural (Male)
// en-NG-EzinneNeural (Female)
// en-NZ	English (New Zealand)	en-NZ-MitchellNeural (Male)
// en-NZ-MollyNeural (Female)
// en-PH	English (Philippines)	en-PH-JamesNeural (Male)
// en-PH-RosaNeural (Female)
// en-SG	English (Singapore)	en-SG-LunaNeural (Female)
// en-SG-WayneNeural (Male)
// en-TZ	English (Tanzania)	en-TZ-ElimuNeural (Male)
// en-TZ-ImaniNeural (Female)
// en-US	English (United States)	en-US-AIGenerate1Neural1 (Male)
// en-US-AIGenerate2Neural1 (Female)
// en-US-AmberNeural (Female)
// en-US-AnaNeural (Female, Child)
// en-US-AriaNeural (Female)
// en-US-AshleyNeural (Female)
// en-US-BrandonNeural (Male)
// en-US-ChristopherNeural (Male)
// en-US-CoraNeural (Female)
// en-US-DavisNeural (Male)
// en-US-ElizabethNeural (Female)
// en-US-EricNeural (Male)
// en-US-GuyNeural (Male)
// en-US-JacobNeural (Male)
// en-US-JaneNeural (Female)
// en-US-JasonNeural (Male)
// en-US-JennyMultilingualNeural3 (Female)
// en-US-JennyNeural (Female)
// en-US-MichelleNeural (Female)
// en-US-MonicaNeural (Female)
// en-US-NancyNeural (Female)
// en-US-RogerNeural (Male)
// en-US-SaraNeural (Female)
// en-US-SteffanNeural (Male)
// en-US-TonyNeural (Male)
// en-ZA	English (South Africa)	en-ZA-LeahNeural (Female)
// en-ZA-LukeNeural (Male)

async function getAzureTTS(params: AzureParams): Promise<TTSResult> {
	const azureSpeechConfig = sdk.SpeechConfig.fromSubscription(params.apiKey, azureSpeechRegion);

	// Set the output format
	azureSpeechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Ogg48Khz16BitMonoOpus;

	// Set voice
	azureSpeechConfig.speechSynthesisVoiceName = 'en-US-BrandonNeural';

	const speechSynthesizer = new sdk.SpeechSynthesizer(azureSpeechConfig);

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
	audioPlayer: AudioPlayer,
	arrayBuffer: ArrayBuffer,
	connection: VoiceConnection | undefined,
	service: TTSParams['service'],
): Promise<void> {
	invariant(connection, 'No voice connection found');

	let b = arrayBuffer;
	if (service === 'azure') {
		const trimDuration = 0.03; // Set this value to the desired amount of silence to trim, in seconds
		const trimBytes = Math.floor(trimDuration * 48000 * 2 * 2); // Assuming 48kHz, 16-bit audio, and 2 channels
		b = arrayBuffer.slice(0, -trimBytes);
	}
	const buffer = Buffer.from(new Uint8Array(b));
	const bufferStream = Readable.from(buffer);
	const audioResource = createAudioResource(bufferStream);

	audioPlayer.play(audioResource);

	const sub = connection.subscribe(audioPlayer);

	return new Promise((resolve, reject) => {
		audioPlayer.on(AudioPlayerStatus.Idle, () => {
			audioPlayer.removeAllListeners();
			sub?.unsubscribe();
			resolve();
		});

		audioPlayer.on('error', (error) => {
			console.error('Error while playing audio:', error);
			reject(error);
		});
	});
}

export async function playFilePath(
	audioPlayer: AudioPlayer,
	audioResource: AudioResource<null>,
	connection: VoiceConnection | undefined,
): Promise<void> {
	invariant(connection, 'No voice connection found');

	audioPlayer.play(audioResource);
	const sub = connection.subscribe(audioPlayer);

	return new Promise((resolve, reject) => {
		audioPlayer.on(AudioPlayerStatus.Idle, () => {
			audioPlayer.removeAllListeners();
			sub?.unsubscribe();
			resolve();
		});

		audioPlayer.on('error', (error) => {
			console.error('Error while playing audio:', error);
			reject(error);
		});
	});
}

export async function playText(
	audioPlayer: AudioPlayer,
	params: TTSParams,
	connection: VoiceConnection,
): Promise<void> {
	try {
		if (connection) {
			const ttsResult = await textToSpeech(params);
			return await playArrayBuffer(audioPlayer, ttsResult.arrayBuffer, connection, params.service);
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
