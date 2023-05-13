import { Config } from '@/config.js';

export type Tool = {
	name: string;
	description: string;
	inputGuide: string;
	outputGuide: string;
};

export type RelayResponderConfig = {
	BotName?: string;
	Personality?: string;
	SpeakingMode?: number;
	LinesBeforeSleep?: number;
	BotNameConfidenceThreshold?: number;
	LLMService?: string;
	LLMModel?: string;
	TranscriptContextSize?: number;
	IgnoreUser?: string;
	StopIgnoringUser?: string;
	Tools?: Tool[];
};

const authToken = Config.VOICE_RELAY_AUTH_KEY;
const url = Config.VOICE_RELAY_URL;

export async function joinCall(
	guildId: string,
	channelId: string,
	transcriptKey: string,
	config: RelayResponderConfig,
): Promise<void> {
	const endpoint = `${url}/join`;

	const body = {
		GuildID: guildId,
		ChannelID: channelId,
		RedisTranscriptKey: transcriptKey,
		ResponderConfig: config,
	};

	console.log('Voice channel id: ' + channelId);
	console.log('Guild id: ' + guildId);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify(body),
	});
	console.log(await response.text());

	if (!response.ok) {
		throw new Error(`Error joining voice channel: ${response.statusText}`);
	}
}

export async function leaveCall(guildId: string): Promise<void> {
	console.log('Leaving voice channel: ', guildId);

	const endpoint = `${url}/leave`;

	const body = {
		GuildID: guildId,
	};

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Error leaving voice channel: ${response.statusText}`);
	}
}

export async function configResponder(guildId: string, config: RelayResponderConfig): Promise<void> {
	const endpoint = `${url}/${guildId}/config`;

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify(config),
	});
	console.log(await response.text());

	if (!response.ok) {
		throw new Error(`Error configuring responder: ${response.statusText}`);
	}
}
