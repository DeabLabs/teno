import type { Client, Message, TextChannel } from 'discord.js';

import { EventSourceWrapper } from '@/utils/eventSourceWrapper.js';
import { Config } from '@/config.js';

export type Tool = {
	Name: string;
	Description: string;
	InputGuide: string;
	OutputGuide: string;
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

export enum SpeakingModeType {
	Unspecified = 0,
	NeverSpeak = 1,
	AlwaysSleep = 2,
	AutoSleep = 3,
	NeverSleep = 4,
}

export class VoiceRelayClient {
	private authToken: string;
	private url: string;
	private guildId: string;
	private config: RelayResponderConfig;
	private toolHandlers: Map<string, (input: string) => Promise<string | null>>;
	private toolEventSource?: EventSourceWrapper;

	constructor(authToken: string, guildId: string) {
		this.authToken = authToken;
		this.url = Config.VOICE_RELAY_URL;
		this.guildId = guildId;
		this.config = {
			BotName: '',
			Personality: '',
			SpeakingMode: 0,
			LinesBeforeSleep: 0,
			BotNameConfidenceThreshold: 0,
			LLMService: '',
			LLMModel: '',
			TranscriptContextSize: 0,
			Tools: [],
		};
		this.toolHandlers = new Map();
	}

	async joinCall(channelId: string, transcriptKey: string, config: RelayResponderConfig): Promise<void> {
		const endpoint = `${this.url}/join`;

		const body = {
			GuildID: this.guildId,
			ChannelID: channelId,
			RedisTranscriptKey: transcriptKey,
			ResponderConfig: config,
		};

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.authToken}`,
				},
				body: JSON.stringify(body),
			});
			console.log(await response.text());

			if (!response.ok) {
				throw new Error(`Error joining voice channel: ${response.statusText}`);
			}

			this.toolEventSource = this.subscribeToToolMessages(this.handleToolMessage.bind(this), console.error);
		} catch (error) {
			console.error(error);
		}
	}

	async leaveCall(): Promise<void> {
		const endpoint = `${this.url}/leave`;

		const body = {
			GuildID: this.guildId,
		};

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.authToken}`,
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				throw new Error(`Error leaving voice channel: ${response.statusText}`);
			}

			// Disconnect the EventSourceWrapper when leaving the call
			if (this.toolEventSource) {
				this.toolEventSource.disconnect();
			}
		} catch (error) {
			console.error(error);
		}
	}

	async configResponder(config: RelayResponderConfig): Promise<void> {
		const endpoint = `${this.url}/${this.guildId}/config`;

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.authToken}`,
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

	async ignoreUser(userId: string): Promise<void> {
		this.configResponder({ IgnoreUser: userId });
	}

	async stopIgnoringUser(userId: string): Promise<void> {
		this.configResponder({ StopIgnoringUser: userId });
	}

	async setPersona(botName: string, personality: string): Promise<void> {
		this.configResponder({ BotName: botName, Personality: personality });
	}

	async setSpeakingMode(mode: SpeakingModeType): Promise<void> {
		this.configResponder({ SpeakingMode: mode });
	}

	subscribeToToolMessages(
		onMessage: (toolMessage: string) => void,
		onError: (error: Event) => void,
	): EventSourceWrapper {
		const headers = { Authorization: `Bearer ${this.authToken}` };
		const endpoint = `${this.url}/${this.guildId}/tool-messages`;

		try {
			const eventSourceWrapper = new EventSourceWrapper(endpoint, headers, onMessage, onError);
			eventSourceWrapper.connect();

			return eventSourceWrapper;
		} catch (error) {
			console.error(`Error subscribing to tool messages:`, error);
			throw error;
		}
	}

	async pushToCache(item: CacheItem): Promise<void> {
		const endpoint = `${this.url}/${this.guildId}/tool-messages`;

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.authToken}`,
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

	async editTool(
		name: string,
		description: string,
		inputGuide: string,
		outputGuide: string,
		handler: (input: string) => Promise<string | null>,
	) {
		try {
			await this.configResponder({
				Tools: [
					{
						Name: name,
						Description: description,
						InputGuide: inputGuide,
						OutputGuide: outputGuide,
					},
				],
			});
		} catch (error) {
			console.error(error);
		}

		// Add the handler to a map of tool handlers
		this.toolHandlers.set(name, handler);
	}

	async handleToolMessage(toolMessage: string) {
		console.log(toolMessage);

		// Parse the tool message JSON
		const toolMessageJson = JSON.parse(toolMessage);

		// Loop through each tool message
		for (const message of toolMessageJson) {
			// Get the handler for this tool
			const handler = this.toolHandlers.get(message.name);

			// If there is a handler, call it with the tool message's input
			if (handler) {
				const output = await handler(message.input);

				// If the output is not null or undefined, push it to the cache
				if (output !== null && output !== undefined) {
					await this.pushToCache({
						Name: `${message.name}Response`,
						Content: output,
					});
				}
			}
		}
	}

	async syncTextChannel(
		discordClient: Client,
		textChannel: TextChannel,
		textChannelName?: string,
		messageHistoryLength?: number,
	): Promise<void> {
		textChannelName = 'TextChannel';

		// Define the tool
		await this.editTool(
			`SendMessageTo${textChannelName}`,
			`This tool allows you to send a message to the discord text channel associated with this voice call. There is only one text channel. Only use this tool when a user specifically asks for something to be sent by text.`,
			`The input is a string, which is the message you'd like to send to the channel.`,
			`This tool does not return any output.`,
			async (input: string) => {
				// Send message to text channel
				textChannel.send(input);
				return null;
			},
		);

		// Setup listener for new messages in the text channel
		discordClient.on('messageCreate', async (message) => {
			if (message.channelId === textChannel.id) {
				const conversationHistory = await message.channel.messages.fetch({ limit: messageHistoryLength ?? 10 });
				const conversationHistoryContent: string[] = [];

				conversationHistory.forEach((msg: Message<true> | Message<false>) => {
					if ('content' in msg && 'username' in msg.author) {
						conversationHistoryContent.unshift(`${msg.author.username}: ${msg.content}`);
					}
				});

				if (textChannelName === undefined) {
					textChannelName = 'TextChannel';
				}

				await this.pushToCache({
					Name: textChannelName,
					Content: conversationHistoryContent.join('\n'),
				});
			}
		});
	}
}
