import type { Client, Message, TextChannel } from 'discord.js';

import { EventSourceWrapper } from '@/utils/eventSourceWrapper.js';
import { Config } from '@/config.js';

export interface JoinRequest {
	BotID: string;
	GuildID: string;
	ChannelID: string;
	Config: Config;
	RedisTranscriptKey?: string;
}

interface Config {
	BotName: string;
	PromptContents: PromptContents;
	VoiceUXConfig: VoiceUXConfig;
	LLMConfig: LLMConfig;
	TTSConfig: TTSConfig;
	TranscriptConfig: TranscriptConfig;
	TranscriberConfig: TranscriberConfig;
}

interface PromptContents {
	Personality: string;
	ToolList: Tool[];
	Documents: Document[];
	Tasks: Task[];
}

interface Tool {
	Name: string;
	Description: string;
	InputGuide: string;
	OutputGuide: string;
}

interface Document {
	Name: string;
	Content: string;
}

interface Task {
	Name: string;
	Description: string;
	DeliverableGuide: string;
}

interface VoiceUXConfig {
	SpeakingMode: string;
	LinesBeforeSleep: number;
	BotNameConfidenceThreshold: number;
	AutoRespondInterval: number;
}

interface LLMConfig {
	LLMServiceName: string;
	LLMConfig: OpenaiConfig;
}

interface OpenaiConfig {
	ApiKey: string;
	Model: string;
}

interface TTSConfig {
	TTSServiceName: string;
	TTSConfig: AzureConfig;
}

interface AzureConfig {
	ApiKey: string;
	Model: string;
	VoiceID: string;
	Language: string;
	Gender: string;
}

interface TranscriptConfig {
	NumberOfTranscriptLines: number;
}

interface TranscriberConfig {
	Keywords: string[];
	IgnoredUsers: string[];
}

export class VoiceRelayClient {
	private discordClient: Client;
	private authToken: string;
	private url: string;
	private botId: string;
	private botToken: string;
	private guildId: string;
	private config: Config;
	private toolHandlers: Map<string, (input: string) => Promise<string | null>>;
	private toolEventSource?: EventSourceWrapper;

	constructor(discordClient: Client, authToken: string, botId: string, botToken: string, guildId: string) {
		this.discordClient = discordClient;
		this.authToken = authToken;
		this.url = Config.VOICE_RELAY_URL;
		this.botId = botId;
		this.botToken = botToken;
		this.guildId = guildId;
		this.config = {
			BotName: 'Bot',
			PromptContents: {
				Personality: 'Helpful Discord voice bot',
				ToolList: [],
				Documents: [],
				Tasks: [],
			},
			VoiceUXConfig: {
				SpeakingMode: 'AutoSleep',
				LinesBeforeSleep: 4,
				BotNameConfidenceThreshold: 0.7,
				AutoRespondInterval: 0, // When there are pending tasks, how long to wait before responding again
			},
			LLMConfig: {
				LLMServiceName: 'openai',
				LLMConfig: {
					ApiKey: Config.OPENAI_API_KEY,
					Model: 'gpt-3.5-turbo',
				},
			},
			TTSConfig: {
				TTSServiceName: 'azure',
				TTSConfig: {
					ApiKey: Config.AZURE_SPEECH_KEY,
					Model: 'neural',
					VoiceID: 'en-US-BrandonNeural',
					Language: 'en-US',
					Gender: 'Male',
				},
			},
			TranscriptConfig: {
				NumberOfTranscriptLines: 20,
			},
			TranscriberConfig: {
				Keywords: [],
				IgnoredUsers: [],
			},
		};
		this.toolHandlers = new Map();
	}

	async joinCall(channelId: string, transcriptKey: string): Promise<void> {
		const endpoint = `${this.url}/join`;

		const body = {
			BotID: this.botId,
			BotToken: this.botToken,
			GuildID: this.guildId,
			ChannelID: channelId,
			RedisTranscriptKey: transcriptKey,
			Config: this.config,
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
		const endpoint = `${this.url}/${this.botId}/${this.guildId}/leave`;

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

	async UpdateConfig(): Promise<void> {
		const endpoint = `${this.url}/${this.botId}/${this.guildId}/config`;

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.authToken}`,
				},
				body: JSON.stringify(this.config),
			});
			console.log(await response.text());

			if (!response.ok) {
				throw new Error(`Error updating config: ${response.statusText}`);
			}
		} catch (error) {
			console.error(error);
		}
	}

	async ignoreUser(userId: string): Promise<void> {
		this.config.TranscriberConfig.IgnoredUsers.push(userId);
		await this.UpdateConfig();
	}

	async stopIgnoringUser(userId: string): Promise<void> {
		this.config.TranscriberConfig.IgnoredUsers = this.config.TranscriberConfig.IgnoredUsers.filter(
			(id) => id !== userId,
		);
		await this.UpdateConfig();
	}

	async updatePersona(botName: string, personality: string): Promise<void> {
		this.config.BotName = botName;
		this.config.PromptContents.Personality = personality;
		await this.UpdateConfig();
	}

	async updateSpeakingMode(mode: string): Promise<void> {
		this.config.VoiceUXConfig.SpeakingMode = mode;
		await this.UpdateConfig();
	}

	subscribeToToolMessages(
		onMessage: (toolMessage: string) => void,
		onError: (error: Event) => void,
	): EventSourceWrapper {
		const headers = { Authorization: `Bearer ${this.authToken}` };
		const endpoint = `${this.url}/${this.botId}/${this.guildId}/tool-messages`;

		try {
			const eventSourceWrapper = new EventSourceWrapper(endpoint, headers, onMessage, onError);
			eventSourceWrapper.connect();

			return eventSourceWrapper;
		} catch (error) {
			console.error(`Error subscribing to tool messages:`, error);
			throw error;
		}
	}

	addDocument(name: string, content: string) {
		this.config.PromptContents.Documents.push({
			Name: name,
			Content: content,
		});
	}

	addTool(
		name: string,
		description: string,
		inputGuide: string,
		outputGuide: string,
		handler: (input: string) => Promise<string | null>,
	) {
		this.config.PromptContents.ToolList.push({
			Name: name,
			Description: description,
			InputGuide: inputGuide,
			OutputGuide: outputGuide,
		});
		this.toolHandlers.set(name, handler);
	}

	addTask(name: string, description: string, deliverableGuide: string) {
		this.config.PromptContents.Tasks.push({
			Name: name,
			Description: description,
			DeliverableGuide: deliverableGuide,
		});
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
					this.addDocument(`${message.name}Response`, output);
					await this.UpdateConfig();
				}
			}
		}
	}

	async syncTextChannel(
		textChannel: TextChannel,
		textChannelName?: string,
		messageHistoryLength?: number,
	): Promise<void> {
		textChannelName = 'TextChannel';

		// Define the tool
		this.addTool(
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
		this.discordClient.on('messageCreate', async (message) => {
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

				this.addDocument(`${textChannelName}`, conversationHistoryContent.join('\n'));
			}
		});

		// Add the tool and document to the config
		this.UpdateConfig();
	}
}
