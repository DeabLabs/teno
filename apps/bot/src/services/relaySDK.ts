import { EventEmitter } from 'events';

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
	Tools: Tool[];
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

export const DEFAULT_CONFIG: Config = {
	BotName: 'Bot',
	PromptContents: {
		Personality: 'Helpful Discord voice bot',
		Tools: [],
		Documents: [],
		Tasks: [],
	},
	VoiceUXConfig: {
		SpeakingMode: 'AutoSleep',
		LinesBeforeSleep: 5,
		BotNameConfidenceThreshold: 0.7,
		AutoRespondInterval: 5, // When there are pending tasks, how long to wait before responding again
	},
	LLMConfig: {
		LLMServiceName: 'openai',
		LLMConfig: {
			ApiKey: Config.OPENAI_API_KEY,
			Model: 'gpt-4',
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

export class VoiceRelayClient {
	private discordClient: Client;
	private authToken: string;
	private url: string;
	private botId: string;
	private botToken: string;
	private guildId: string;
	private config: Config;
	private toolEventEmitter: EventEmitter;
	private toolEventSource?: EventSourceWrapper;

	constructor(discordClient: Client, authToken: string, botId: string, botToken: string, guildId: string) {
		this.discordClient = discordClient;
		this.authToken = authToken;
		this.url = Config.VOICE_RELAY_URL;
		this.botId = botId;
		this.botToken = botToken;
		this.guildId = guildId;
		this.config = DEFAULT_CONFIG;
		this.toolEventEmitter = new EventEmitter();
	}

	async joinCall(channelId: string, transcriptKey: string, config: Config): Promise<void> {
		this.config = config;

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

			this.toolEventSource = await this.subscribeToToolMessages();
			console.log('Subscribed to tool messages');
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

	async updateConfig(): Promise<void> {
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
			console.log(`Updated prompt: ${JSON.stringify(this.config.PromptContents, null, 2)}`);

			if (!response.ok) {
				throw new Error(`Error updating config: ${response.statusText}`);
			}
		} catch (error) {
			console.error(error);
		}
	}

	async subscribeToToolMessages(): Promise<EventSourceWrapper> {
		const headers = { Authorization: `Bearer ${this.authToken}` };
		const endpoint = `${this.url}/${this.botId}/${this.guildId}/tool-messages`;

		try {
			// Define the message handler internally
			const onMessage = (toolMessage: string) => {
				try {
					const toolMessageJson = JSON.parse(toolMessage);

					for (const message of toolMessageJson) {
						// Emit an event named after the tool with the input as data
						this.toolEventEmitter.emit(message.name, message.input);
					}
				} catch (error) {
					console.error(`Error processing tool message:`, error);
				}
			};

			// Define the error handler internally
			const onError = (error: Event) => {
				console.error(`Error subscribing to tool messages:`, error);
			};

			const eventSourceWrapper = new EventSourceWrapper(endpoint, headers, onMessage, onError);
			eventSourceWrapper.connect();

			return eventSourceWrapper;
		} catch (error) {
			console.error(`Error creating EventSourceWrapper:`, error);
			throw error;
		}
	}

	/**
	 * Syncs a Discord text channel with the voice bot, adding a tool to allow sending messages to the channel,
	 * and automatically updating a document to reflect the recent conversation history in the channel.
	 *
	 * @param {TextChannel} textChannel - The Discord text channel to sync with the voice bot.
	 * @param {number} [messageHistoryLength] - Optional. The number of recent messages to include in the conversation history document. Defaults to 10.
	 *
	 * @returns {Promise<void>}
	 */
	async syncTextChannel(
		textChannel: TextChannel,
		messageHistoryLength?: number,
		sendMessageTool?: boolean,
		respondOnEveryMessage?: boolean,
	): Promise<void> {
		// Format the text channel name to be used as the document key
		const words = textChannel.name.split(' ');
		const textChannelName = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');

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

				this.removeDocument(`${textChannelName}`);
				this.addDocument(`${textChannelName}`, conversationHistoryContent.join('\n'));

				this.updateConfig();

				if (respondOnEveryMessage) {
					this.pushTaskWithCompletionTool(
						`RelayNewMessageTo${textChannelName}`,
						`Relay the relevant information from the most recent message in ${textChannelName} to the voice channel.`,
						`Input "done" in the associated tool when the relevant information from the most recent message in ${textChannelName} has been relayed. Do not mention this task in the voice channel.`,
					);
				}
			}
		});

		if (sendMessageTool) {
			this.addTool(
				`SendMessageTo${textChannelName}`,
				`This tool allows you to send a message to the discord text channel associated with this voice call. There is only one text channel. Only use this tool when a user specifically asks for something to be sent by text.`,
				`The input is a string, which is the message you'd like to send to the channel.`,
				`This tool does not return any output.`,
			);
			this.toolEventEmitter.on(`SendMessageTo${textChannelName}`, (message: string) => {
				console.log(`Sending message to ${textChannelName}: ${message}`);
				textChannel.send(message);
			});
		}

		// Add the tool and document to the config
		this.updateConfig();
	}

	/**
	 * Pushes a task to the voice bot that can be marked as complete or rejected using a specific tool.
	 *
	 * @param {string} taskName - The name of the task.
	 * @param {string} taskDescription - A description of the task.
	 * @param {string} deliverableGuide - A guide on what constitutes a complete deliverable for the task.
	 *
	 * @returns {Promise<void>}
	 */
	async pushTaskWithCompletionTool(taskName: string, taskDescription: string, deliverableGuide: string): Promise<void> {
		// Create the task
		this.addTask(taskName, taskDescription, deliverableGuide);

		// Define tool's input and output guide
		const toolInputGuide = `When the associated task is completed, input "done" into this tool. Input "reject" if the task cannot be completed.`;
		const toolOutputGuide = `This tool does not return any output.`;

		// Create the corresponding tool
		this.addTool(
			`${taskName}Tool`,
			`This tool is used to signal completion of the "${taskName}" task.`,
			toolInputGuide,
			toolOutputGuide,
		);

		// Update the bot's configuration to reflect the new task and tool
		await this.updateConfig();

		// Listen for tool events
		return new Promise<void>((resolve, reject) => {
			this.toolEventEmitter.once(`${taskName}Tool`, (input: string) => {
				this.removeTask(taskName);
				this.removeTool(`${taskName}Tool`);
				this.updateConfig();
				if (input === 'done') {
					resolve();
				} else if (input === 'reject') {
					reject();
				}
			});
		});
	}

	/**
	 * Pushes a task and an associated tool to the voice bot. The task asks for a deliverable, which can be provided or rejected using the accompanying tool.
	 *
	 * @param {string} taskName - The name of the task.
	 * @param {string} taskDescription - A description of the task.
	 * @param {string} deliverableGuide - A guide on what the bot should input into the tool.
	 *
	 * @returns {Promise<string>} - Returns a promise resolving with the deliverable, or rejects if the deliverable cannot be acquired.
	 */
	async pushTaskWithDeliverableTool(
		taskName: string,
		taskDescription: string,
		deliverableGuide: string,
	): Promise<string> {
		// Create the task
		this.addTask(taskName, taskDescription, deliverableGuide);

		// Define tool's input and output guide
		const toolInputGuide = `When you have the deliverable described in the task's deliverable guide, input it into this tool. Input "reject" if the deliverable cannot be acquired.`;
		const toolOutputGuide = `The tool does not return any output.`;

		// Create the corresponding tool
		this.addTool(
			`${taskName}Tool`,
			`This tool is used to send the deliverable for the "${taskName}" task when it has been acquired.`,
			toolInputGuide,
			toolOutputGuide,
		);

		// Update the bot's configuration to reflect the new task and tool
		await this.updateConfig();

		// Listen for tool events
		return new Promise<string>((resolve, reject) => {
			this.toolEventEmitter.once(`${taskName}Tool`, (input: string) => {
				this.removeTask(taskName);
				this.removeTool(`${taskName}Tool`);
				this.updateConfig();
				if (input === 'reject') {
					reject('Deliverable could not be acquired.');
				} else {
					resolve(input);
				}
			});
		});
	}

	/**
	 * Pushes a document to the voice bot and creates a task that prompts for a confirmation of delivery to the voice channel.
	 *
	 * @param {string} documentName - The name of the document.
	 * @param {string} documentContent - The content of the document.
	 *
	 * @returns {Promise<void>}
	 */
	async pushDocumentWithDeliveryConfirmationTool(documentName: string, documentContent: string): Promise<void> {
		// Create the document
		this.addDocument(documentName, documentContent);

		// Update the bot's configuration to reflect the new document
		await this.updateConfig();

		// Define the task parameters
		const taskName = `Relay${documentName}`;
		const taskDescription = `Relay the relevant information from the document "${documentName}" in the voice channel.`;
		const deliverableGuide = `Input "done" in the associated tool when the relevant information in the document has been relayed. This will remove the document. Do not mention this task in the voice channel.`;

		// Create the task with completion and handle the completion
		try {
			await this.pushTaskWithCompletionTool(taskName, taskDescription, deliverableGuide);
			console.log(`Document "${documentName}" has been delivered successfully.`);
		} catch {
			console.error(`Delivery of document "${documentName}" was rejected.`);
		}

		// Remove the document
		this.removeDocument(documentName);

		// Update the bot's configuration to reflect the document removal
		await this.updateConfig();
	}

	/**
	 * Pushes a tool to the voice bot and sets up a handler function for tool uses.
	 * If the handler function returns a string, the tool will output that string as a document with a delivery confirmation task.
	 * @param params - The parameters for the tool.
	 * @param params.toolName - The name of the tool.
	 * @param params.toolDescription - A description of the tool.
	 * @param params.toolInputGuide - A guide on what to input into the tool.
	 * @param params.toolOutputGuide - A guide on the output of the tool.
	 * @param params.handler - A handler function to handle tool uses. If the handler returns a string, the tool will output that string as a document with a delivery confirmation task.
	 *
	 * @returns {Promise<void>}
	 */
	async addToolWithHandler(params: {
		toolName: string;
		toolDescription: string;
		toolInputGuide: string;
		toolOutputGuide: string;
		handler: (query: string) => Promise<string | void>;
	}): Promise<void> {
		// Create the tool
		this.addTool(params.toolName, params.toolDescription, params.toolInputGuide, params.toolOutputGuide);

		// Listen for tool events
		this.toolEventEmitter.on(params.toolName, async (query: string) => {
			// Handle the query and produce a result
			const result = await params.handler(query);

			// Create a document with the result and send it to the LLM only if result is not void
			if (result !== undefined) {
				const documentName = `${params.toolName}Output`;
				const documentContent = `input: ` + query + `\noutput: ` + result;
				await this.pushDocumentWithDeliveryConfirmationTool(documentName, documentContent);
			}
		});

		// Update the bot's configuration to reflect the new tool
		await this.updateConfig();
	}

	/**
	 * Creates a notes document and adds a tool that allows the LLM to write lines to the document.
	 *
	 * @param {string} notesDocName - The name of the notes document.
	 * @param {string} notesDocDescription - A description of what the notes document should be used for.
	 *
	 * @returns {Promise<void>}
	 */
	async addNotesDoc(notesDocName: string, notesDocDescription: string): Promise<void> {
		// Add a new document with the given name. The document's content starts empty.
		this.addDocument(notesDocName, `${notesDocDescription}\n}`);

		// Define a tool that allows the LLM to write lines to the document.
		const toolName = `WriteTo${notesDocName}`;
		const toolDescription = `This tool allows you to add a line to the "${notesDocName}" notes document.`;
		const toolInputGuide = 'Input the line you would like to add to the document.';
		const toolOutputGuide = 'This tool does not return any output.';

		// Add the tool with a handler that writes the given input line to the document.
		await this.addToolWithHandler({
			toolName,
			toolDescription,
			toolInputGuide,
			toolOutputGuide,
			handler: async (line: string) => {
				// Fetch the current content of the document.
				const currentContent = this.getDocumentContent(notesDocName);

				// Append the new line to the current content.
				const updatedContent = currentContent + '\n' + line;

				// Update the document with the new content.
				this.updateDocument(notesDocName, updatedContent);
			},
		});

		// Update the LLM's configuration to reflect the new document and tool.
		await this.updateConfig();
	}

	/**
	 * Attempts to get user input by pushing a task that requires a deliverable,
	 * and returns the deliverable or null if it cannot be acquired.
	 *
	 * @param {string} inputName - The name of the input to get.
	 * @param {string} inputDescription - A description of the input.
	 *
	 * @returns {Promise<string|null>} - Returns a promise resolving with the deliverable,
	 * or null if the deliverable cannot be acquired.
	 */
	async getUserInput(inputName: string, inputDescription: string): Promise<string | null> {
		try {
			return await this.pushTaskWithDeliverableTool(
				`Get${inputName}`,
				`Get the value for "${inputName}". Description: ${inputDescription}.`,
				`Input the value for "${inputName}" into the associated tool.`,
			);
		} catch (error) {
			console.error(`Failed to get user input "${inputName}":`, error);
			return null;
		}
	}

	/**
	 * Attempts to fill multiple fields by pushing tasks for each field that require a deliverable, and returns a dictionary mapping field names to their deliverables or null if a deliverable cannot be acquired.
	 *
	 * @param {{[key: string]: string}} fields - A dictionary mapping field names to their descriptions.
	 *
	 * @returns {Promise<{[key: string]: string|null}>} - Returns a promise resolving with a dictionary mapping field names to their deliverables, or null if a deliverable cannot be acquired.
	 */
	async fillForm(fields: { [key: string]: string }): Promise<{ [key: string]: string | null }> {
		const results: { [key: string]: string | null } = {};

		for (const fieldName in fields) {
			const fieldDescription = fields[fieldName];
			if (fieldDescription) {
				const result = await this.getUserInput(fieldName, fieldDescription);
				results[fieldName] = result;
			} else {
				results[fieldName] = null;
			}
		}

		return results;
	}

	// Config type:
	// {
	// 	BotName: 'Bot',
	// 	PromptContents: {
	// 		Personality: 'Helpful Discord voice bot',
	// 		Tools: [],
	// 		Documents: [],
	// 		Tasks: [],
	// 	},
	// 	VoiceUXConfig: {
	// 		SpeakingMode: 'AutoSleep',
	// 		LinesBeforeSleep: 4,
	// 		BotNameConfidenceThreshold: 0.7,
	// 		AutoRespondInterval: 10, // When there are pending tasks, how long to wait before responding again
	// 	},
	// 	LLMConfig: {
	// 		LLMServiceName: 'openai',
	// 		LLMConfig: {
	// 			ApiKey: Config.OPENAI_API_KEY,
	// 			Model: 'gpt-3.5-turbo',
	// 		},
	// 	},
	// 	TTSConfig: {
	// 		TTSServiceName: 'azure',
	// 		TTSConfig: {
	// 			ApiKey: Config.AZURE_SPEECH_KEY,
	// 			Model: 'neural',
	// 			VoiceID: 'en-US-BrandonNeural',
	// 			Language: 'en-US',
	// 			Gender: 'Male',
	// 		},
	// 	},
	// 	TranscriptConfig: {
	// 		NumberOfTranscriptLines: 20,
	// 	},
	// 	TranscriberConfig: {
	// 		Keywords: [],
	// 		IgnoredUsers: [],
	// 	},
	// };

	addDocument(name: string, content: string) {
		this.config.PromptContents.Documents.push({
			Name: name,
			Content: content,
		});
	}

	addTool(name: string, description: string, inputGuide: string, outputGuide: string) {
		this.config.PromptContents.Tools.push({
			Name: name,
			Description: description,
			InputGuide: inputGuide,
			OutputGuide: outputGuide,
		});
	}

	addTask(name: string, description: string, deliverableGuide: string) {
		this.config.PromptContents.Tasks.push({
			Name: name,
			Description: description,
			DeliverableGuide: deliverableGuide,
		});
	}

	removeDocument(name: string) {
		this.config.PromptContents.Documents = this.config.PromptContents.Documents.filter((doc) => doc.Name !== name);
	}

	removeTool(name: string) {
		this.config.PromptContents.Tools = this.config.PromptContents.Tools.filter((tool) => tool.Name !== name);
	}

	removeTask(name: string) {
		this.config.PromptContents.Tasks = this.config.PromptContents.Tasks.filter((task) => task.Name !== name);
	}

	getDocumentContent(name: string): string | null {
		const document = this.config.PromptContents.Documents.find((doc) => doc.Name === name);
		if (document) {
			return document.Content;
		} else {
			console.error(`Document "${name}" not found.`);
			return null;
		}
	}

	updateDocument(name: string, newContent: string): void {
		const document = this.config.PromptContents.Documents.find((doc) => doc.Name === name);
		if (document) {
			document.Content = newContent;
		} else {
			console.error(`Document "${name}" not found.`);
		}
	}

	setBotName(name: string) {
		this.config.BotName = name;
	}

	setPersonality(personality: string) {
		this.config.PromptContents.Personality = personality;
	}

	setSpeakingMode(mode: string) {
		this.config.VoiceUXConfig.SpeakingMode = mode;
	}

	setLinesBeforeSleep(lines: number) {
		this.config.VoiceUXConfig.LinesBeforeSleep = lines;
	}

	setBotNameConfidenceThreshold(threshold: number) {
		this.config.VoiceUXConfig.BotNameConfidenceThreshold = threshold;
	}

	setAutoRespondInterval(interval: number) {
		this.config.VoiceUXConfig.AutoRespondInterval = interval;
	}

	async ignoreUser(userId: string): Promise<void> {
		if (!this.config.TranscriberConfig.IgnoredUsers.includes(userId)) {
			this.config.TranscriberConfig.IgnoredUsers.push(userId);
			await this.updateConfig();
		}
	}

	async stopIgnoringUser(userId: string): Promise<void> {
		this.config.TranscriberConfig.IgnoredUsers = this.config.TranscriberConfig.IgnoredUsers.filter(
			(id) => id !== userId,
		);
		await this.updateConfig();
	}

	async updatePersona(botName: string, personality: string): Promise<void> {
		this.config.BotName = botName;
		this.config.PromptContents.Personality = personality;
		await this.updateConfig();
	}

	async updateSpeakingMode(mode: string): Promise<void> {
		this.config.VoiceUXConfig.SpeakingMode = mode;
		await this.updateConfig();
	}
}
