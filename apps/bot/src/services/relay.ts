import { Config } from '@/config.js';
import { EventSourceWrapper } from '@/utils/eventSourceWrapper.js';

export type Tool = {
	name: string;
	description: string;
	inputGuide: string;
	outputGuide: string;
};

export type CacheItem = {
	Name: string;
	Content: string;
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

	try {
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
	} catch (error) {
		console.error(error);
	}
}

export async function leaveCall(guildId: string): Promise<void> {
	const endpoint = `${url}/leave`;

	const body = {
		GuildID: guildId,
	};

	try {
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
	} catch (error) {
		console.error(error);
	}
}

export async function configResponder(guildId: string, config: RelayResponderConfig): Promise<void> {
	const endpoint = `${url}/${guildId}/config`;

	try {
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
	} catch (error) {
		console.error(error);
	}
}

export function subscribeToToolMessages(
	guildId: string,
	onMessage: (toolMessage: string) => void,
	onError: (error: Event) => void,
): EventSourceWrapper {
	const headers = { Authorization: `Bearer ${authToken}` };
	const endpoint = `${url}/${guildId}/tool-messages`;

	try {
		const eventSourceWrapper = new EventSourceWrapper(endpoint, headers, onMessage, onError);
		eventSourceWrapper.connect();

		return eventSourceWrapper;
	} catch (error) {
		console.error(`Error subscribing to tool messages:`, error);
		throw error;
	}
}

export async function pushToCache(guildId: string, item: CacheItem): Promise<void> {
	const endpoint = `${url}/${guildId}/tool-messages`;

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify(item),
		});
		console.log(await response.text());

		if (!response.ok) {
			throw new Error(`Error pushing to cache: ${response.statusText}`);
		}
	} catch (error) {
		console.error(error);
	}
}
