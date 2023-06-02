import { EventEmitter } from 'events';

import type { Client, TextChannel } from 'discord.js';
import { Message } from 'discord.js';

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
	BotPrimer: string;
	CustomTranscriptPrimer?: string;
	CustomToolPrimer?: string;
	CustomDocumentPrimer?: string;
	CustomTaskPrimer?: string;
	Tools?: Tool[];
	Documents?: Document[];
	Tasks?: Task[];
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
	BotName: 'Teno',
	PromptContents: {
		BotPrimer: 'You are a helpful Discord voice bot named Teno',
		CustomTranscriptPrimer:
			"Below is the transcript of the voice channel, up to the current moment. It may include transcription errors or dropped words (especially at the beginnings of lines), if you think a transcription was incorrect, infer the true words from context. The first sentence of your response should be as short as possible within reason. The transcript may also include information like your previous tool uses, and mark when others interrupted you to stop your words from playing (which may mean they want you to stop talking). If the last person to speak doesn't expect or want a response from you, or they are explicitly asking you to stop speaking, your response should only be the single character '^' with no spaces.",
		CustomToolPrimer:
			"Below is a list of available tools you can use. These are your tools. No one in the voice channel can use them, and they aren't visible to anyone else in the voice channel. Each tool has four attributes: `Name`: the tool's identifier, `Description`: explains the tool's purpose and when to use it, `Input Guide`: advises on how to format the input string, `Output Guide`: describes the tool's return value, if any. To use a tool, you will append a tool message at the end of your normal spoken response, separated by a pipe ('|'). The spoken response is a string of text to be read aloud via TTS. You don't need to write a spoken response to use a tool, your response can simply be a | and then a tool command, in which case your tool command will be processed without any speech playing in the voice channel. Write all tool commands in the form of a JSON array. Each array element is a JSON object representing a tool command, with two properties: `name` and `input`. You shouldn't explain to the other voice call members how you use the tools unless someone asks. Here's an example of a response that uses a tool:\n\nSure thing, I will send a message to the general channel. |[{ \"name\": \"SendMessageToGeneralChannel\", \"input\": \"Hello!\" }]\n\nRemember to write a '|' before writing your tool message. Review the `description`, `input guide`, and `output guide` of each tool carefully to use them effectively.",
		CustomDocumentPrimer: 'Below is a list of documents for you to reference when responding in the voice channel.',
		CustomTaskPrimer:
			"Below is a list of pending tasks. These are tasks for you to do, no one else in the voice channel can see or do them. Each task is represented by its `Name`, `Description`, and `DeliverableGuide`. The `Description` details the task at hand, and the `DeliverableGuide` how to complete the task, whether its the use of a specific tool and/or relaying particular information to someone in the call. These are your tasks, but you may need to ask people in the call for information to complete them. Always take your pending tasks into account when responding, and make every effort to complete them. If the last line of the transcript is telling you to complete pending tasks, attempt to complete them, or mark them done using the associated tools if they are already complete. Do not talk about your tasks in the voice call unless people explicitly ask about them. If you are completing a task, you can simply write the tool message, you don't need to mention it in the voice channel.",
		Tools: [],
		Documents: [],
		Tasks: [],
	},
	VoiceUXConfig: {
		SpeakingMode: 'AutoSleep',
		LinesBeforeSleep: 4,
		BotNameConfidenceThreshold: 0.7,
		AutoRespondInterval: 10, // When there are pending tasks, how long to wait before responding again
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
	private state: string;

	constructor(discordClient: Client, authToken: string, botId: string, botToken: string, guildId: string) {
		this.discordClient = discordClient;
		this.authToken = authToken;
		this.url = Config.VOICE_RELAY_URL;
		this.botId = botId;
		this.botToken = botToken;
		this.guildId = guildId;
		this.config = DEFAULT_CONFIG;
		this.toolEventEmitter = new EventEmitter();
		this.state = 'Awake';
	}

	public getConfig(): Config {
		return this.config;
	}

	public getState(): string {
		return this.state;
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
			// console.log(await response.text());
			// console.log(`Updated prompt: ${JSON.stringify(this.config.PromptContents, null, 2)}`);

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
					if (!isValidJson(toolMessage)) {
						console.error('Received invalid JSON:', toolMessage.substring(0, 100));
						return;
					}

					const toolMessageJson = JSON.parse(toolMessage);

					if (toolMessageJson.Type == 'state') {
						this.state = toolMessageJson.Data;
						return;
					}

					if (toolMessageJson.Type == 'tool-message') {
						const messages = JSON.parse(toolMessageJson.Data);
						for (const message of messages) {
							// Emit an event named after the tool with the input as data
							this.toolEventEmitter.emit(message.name, message.input);
							console.log(`Emitted tool event: ${message.name} with input: ${message.input}`);
						}
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

				this.updateDocument(`${textChannelName}`, conversationHistoryContent.join('\n'));

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

	async syncUserResponseChannel(
		textChannel: TextChannel,
		filterFunction?: (message: Message) => Promise<boolean>,
	): Promise<void> {
		// Add listener for new messages in the text channel
		const pinnedMessages = await textChannel.messages.fetchPinned();
		const firstPinnedMessage = pinnedMessages.first();
		let infoContext = '';

		// Format the text channel name to be used as the document key
		const words = textChannel.name.split(' ');
		const textChannelName = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');

		if (firstPinnedMessage instanceof Message) {
			infoContext = firstPinnedMessage.content;
		}

		this.discordClient.on('messageCreate', async (message) => {
			if (message.channelId === textChannel.id && message.author.id !== this.discordClient.user?.id) {
				const shouldRespond = filterFunction ? await filterFunction(message) : true;
				if (shouldRespond) {
					const content = message.content || '[non-text content]';
					const replyContent = await this.pushTaskWithDeliverableTool(
						`GetResponseTo${textChannelName}`,
						`There's a new ${textChannelName}: ${content}. ${infoContext}. Get the response by asking for it in the voice channel.`,
						`When you've acquired the response, input it into the RespondTo${textChannelName} tool.`,
						`RespondTo${textChannelName}`,
					);

					if (replyContent) {
						message.reply(replyContent);
					}
				}
			}
		});
	}

	async syncFeedChannel(
		textChannel: TextChannel,
		filterFunction?: (message: Message) => Promise<boolean>,
	): Promise<void> {
		const infoName = textChannel.name.replace(/-/g, '');

		const pinnedMessages = await textChannel.messages.fetchPinned();
		const firstPinnedMessage = pinnedMessages.first();
		let infoContext = '';

		if (firstPinnedMessage instanceof Message) {
			infoContext = firstPinnedMessage.content;
		}

		this.discordClient.on('messageCreate', async (message) => {
			if (message.channelId === textChannel.id && message.author.id !== this.discordClient.user?.id) {
				const shouldRespond = filterFunction ? await filterFunction(message) : true;
				if (shouldRespond) {
					const infoContent = message.content || '[non-text content]';
					const info = `${infoContext}: ${infoContent}`;
					await this.pushInfo(infoName, info);
				}
			}
		});
	}

	/**
	 * Syncs a Discord text channel with the voice bot. The bot's tool messages are sent into the channel, and the first reply to each message is returned to the handler function.
	 *
	 * @param {TextChannel} textChannel - The Discord text channel to sync with the voice bot.
	 * @param {Object} params - The parameters for the tool.
	 * @param {string} params.toolName - The name of the tool.
	 * @param {string} params.toolDescription - A description of the tool.
	 * @param {string} params.toolInputGuide - A guide on what to input into the tool.
	 * @param {string} params.toolOutputGuide - A guide on the output of the tool.
	 *
	 * @returns {Promise<void>}
	 */
	async syncToolChannel(textChannel: TextChannel): Promise<void> {
		const pinnedMessages = await textChannel.messages.fetchPinned();
		const firstPinnedMessage = pinnedMessages.first();
		let pinnedMessageContent = '';

		if (firstPinnedMessage instanceof Message) {
			pinnedMessageContent = firstPinnedMessage.content;
		}

		// Define the tool parameters
		const params = {
			toolName: textChannel.name.replace(/-/g, ''),
			toolDescription: pinnedMessageContent,
			toolInputGuide: 'Refer to the tool description for how to format inputs.',
			toolOutputGuide: 'Output response will be provided as a relay task description when it is ready.',
		};

		// Use addToolWithHandler with a custom handler
		this.addToolWithHandler({
			...params,
			handler: async (query: string) => {
				// Send the bot's tool message into the channel
				const botMessage = await textChannel.send(query);

				// Create a promise that resolves once the bot's message is replied to
				const replyPromise = new Promise<string>((resolve) => {
					const filter = (message: Message) =>
						Boolean(message.reference && message.reference.messageId === botMessage.id);

					const collector = textChannel.createMessageCollector({ filter, max: 1 });
					collector.on('collect', (reply) => {
						resolve(reply.content);
					});
				});

				// Wait for the reply and return it
				return await replyPromise;
			},
		});
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
		const toolInputGuide = `When the associated task is completed, input 'done' into this tool. Input 'reject' if the task cannot be completed.`;
		const toolOutputGuide = `This tool does not return any output.`;

		// Create the corresponding tool
		this.addTool(
			`${taskName}Done`,
			`This tool is used to signal completion of the ${taskName} task.`,
			toolInputGuide,
			toolOutputGuide,
		);

		// Update the bot's configuration to reflect the new task and tool
		await this.updateConfig();

		// Listen for tool events
		return new Promise<void>((resolve, reject) => {
			this.toolEventEmitter.once(`${taskName}Done`, (input: string) => {
				this.removeTask(taskName);
				this.removeTool(`${taskName}Done`);
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
	 * @param {string} [inputToolName] - Optional. The name of the tool. Defaults to `${taskName}Input`.
	 *
	 * @returns {Promise<string>} - Returns a promise resolving with the deliverable, or rejects if the deliverable cannot be acquired.
	 */
	async pushTaskWithDeliverableTool(
		taskName: string,
		taskDescription: string,
		deliverableGuide: string,
		inputToolName?: string,
	): Promise<string> {
		// Create the task
		this.addTask(taskName, taskDescription, deliverableGuide);

		// Define tool's input and output guide
		const toolInputGuide = `When you have the deliverable described in the task's deliverable guide, input it into this tool. Input 'reject' if the deliverable cannot be acquired.`;
		const toolOutputGuide = `The tool does not return any output.`;

		const toolName = inputToolName ?? `${taskName}Input`;

		// Create the corresponding tool
		this.addTool(
			toolName,
			`This tool is used to send the deliverable for the ${taskName} task when it has been acquired.`,
			toolInputGuide,
			toolOutputGuide,
		);

		// Update the bot's configuration to reflect the new task and tool
		await this.updateConfig();

		// Listen for tool events
		return new Promise<string>((resolve, reject) => {
			this.toolEventEmitter.once(toolName, (input: string) => {
				this.removeTask(taskName);
				this.removeTool(`${taskName}Input`);
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
		const taskDescription = `Relay the relevant information from the document ${documentName} in the voice channel.`;
		const deliverableGuide = `Input 'done' in the associated tool when the relevant information (usually the output) in the document has been relayed. This will remove the document. Do not mention this task in the voice channel.`;

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
	 * Pushes information to the voice bot by creating a task that directly contains the information.
	 *
	 * @param {string} infoName - The name of the information.
	 * @param {string} infoContent - The content of the information.
	 *
	 * @returns {Promise<void>}
	 */
	async pushInfo(infoName: string, infoContent: string): Promise<void> {
		// Define the task parameters
		const taskName = `Relay${infoName}`;
		const taskDescription = `Relay the following information in the voice channel:\n\n${infoContent}`;
		const deliverableGuide = `Input 'done' in the associated tool when the information has been relayed. This will mark the task as complete. Do not mention this task in the voice channel.`;

		// Create the task with completion and handle the completion
		try {
			await this.pushTaskWithCompletionTool(taskName, taskDescription, deliverableGuide);
			console.log(`Information "${infoName}" has been delivered successfully.`);
		} catch {
			console.error(`Delivery of information "${infoName}" was rejected.`);
		}
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

			if (result !== undefined) {
				const infoName = `${params.toolName}Output`;
				const infoContent = `input: ` + query + `\noutput: ` + result;
				await this.pushInfo(infoName, infoContent);
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
		const toolDescription = `This tool allows you to add a line to ${notesDocName}.`;
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
				`${inputName} is a piece of information you have to get from people in the voice channel. This is a description ${inputName}: ${inputDescription}. Ask for that information in the voice channel.`,
				`When you've acquired it, input the ${inputName} into the Get${inputName}Input tool.`,
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

	addDocument(name: string, content: string) {
		this.config.PromptContents.Documents?.push({
			Name: name,
			Content: content,
		});
	}

	addTool(name: string, description: string, inputGuide: string, outputGuide: string) {
		this.config.PromptContents.Tools?.push({
			Name: name,
			Description: description,
			InputGuide: inputGuide,
			OutputGuide: outputGuide,
		});
	}

	addTask(name: string, description: string, deliverableGuide: string) {
		this.config.PromptContents.Tasks?.push({
			Name: name,
			Description: description,
			DeliverableGuide: deliverableGuide,
		});
	}

	removeDocument(name: string) {
		if (this.config.PromptContents.Documents) {
			this.config.PromptContents.Documents = this.config.PromptContents.Documents.filter((doc) => doc.Name !== name);
		}
	}

	removeTool(name: string) {
		if (this.config.PromptContents.Tools) {
			this.config.PromptContents.Tools = this.config.PromptContents.Tools.filter((tool) => tool.Name !== name);
		}
	}

	removeTask(name: string) {
		if (this.config.PromptContents.Tasks) {
			this.config.PromptContents.Tasks = this.config.PromptContents.Tasks.filter((task) => task.Name !== name);
		}
	}

	getDocumentContent(name: string): string | null {
		const document = this.config.PromptContents.Documents?.find((doc) => doc.Name === name);
		if (document) {
			return document.Content;
		} else {
			console.error(`Document "${name}" not found.`);
			return null;
		}
	}

	updateDocument(name: string, newContent: string): void {
		const document = this.config.PromptContents.Documents?.find((doc) => doc.Name === name);
		if (document) {
			document.Content = newContent;
		} else {
			console.error(`Document "${name}" not found.`);
		}
	}

	setBotName(name: string) {
		this.config.BotName = name;
	}

	setBotPrimer(botPrimer: string) {
		this.config.PromptContents.BotPrimer = botPrimer;
	}

	setCustomTranscriptPrimer(customTranscriptPrimer: string) {
		this.config.PromptContents.CustomTranscriptPrimer = customTranscriptPrimer;
	}

	setCustomToolPrimer(customToolPrimer: string) {
		this.config.PromptContents.CustomToolPrimer = customToolPrimer;
	}

	setCustomTaskPrimer(customTaskPrimer: string) {
		this.config.PromptContents.CustomTaskPrimer = customTaskPrimer;
	}

	setCustomDocumentPrimer(customDocumentPrimer: string) {
		this.config.PromptContents.CustomDocumentPrimer = customDocumentPrimer;
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

	setLLMServiceAndModel(serviceName: string, apiKey: string, model: string) {
		this.config.LLMConfig.LLMServiceName = serviceName;
		this.config.LLMConfig.LLMConfig.ApiKey = apiKey;
		this.config.LLMConfig.LLMConfig.Model = model;
	}

	setNumberOfTranscriptLines(lines: number) {
		this.config.TranscriptConfig.NumberOfTranscriptLines = lines;
	}

	async addKeyword(keyword: string): Promise<void> {
		if (!this.config.TranscriberConfig.Keywords.includes(keyword)) {
			this.config.TranscriberConfig.Keywords.push(keyword);
			await this.updateConfig();
		}
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
		this.config.PromptContents.BotPrimer = personality;
		await this.updateConfig();
	}

	async updateSpeakingMode(mode: string): Promise<void> {
		this.config.VoiceUXConfig.SpeakingMode = mode;
		await this.updateConfig();
	}
}

function isValidJson(json: string): boolean {
	try {
		JSON.parse(json);
		return true;
	} catch {
		return false;
	}
}
