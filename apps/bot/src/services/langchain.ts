import { ChatOpenAI } from 'langchain/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from 'langchain/prompts';
import type { LLMResult } from 'langchain/schema';
import { SystemChatMessage } from 'langchain/schema';
import { AIChatMessage, HumanChatMessage } from 'langchain/schema';
import { CallbackManager } from 'langchain/callbacks';
import { System } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RecognizerConfig.js';

import { Config } from '@/config.js';
import { constrainLinesToTokenLimit } from '@/utils/tokens.js';

class TenoCallbackHandler extends CallbackManager {
	private tokenHandler: (token: string) => Promise<void>;
	private endHandler: (output: LLMResult) => void;

	constructor(tokenHandler: (token: string) => Promise<void>, endHandler: (output: LLMResult) => void) {
		super();
		this.tokenHandler = tokenHandler;
		this.endHandler = endHandler;
	}

	override async handleLLMNewToken(token: string): Promise<void> {
		return await this.tokenHandler(token);
	}

	override handleLLMEnd(output: LLMResult): Promise<void> {
		return new Promise((resolve) => {
			resolve(this.endHandler(output));
		});
	}
}

const gptFour = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-4',
	openAIApiKey: Config.OPENAI_API_KEY,
	streaming: true,
});

const gptTurbo = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-3.5-turbo',
	openAIApiKey: Config.OPENAI_API_KEY,
	streaming: true,
});

const models = {
	'gpt-4': gptFour,
	'gpt-3.5-turbo': gptTurbo,
} as const;

export type SupportedModels = keyof typeof models;

const secretary = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences. If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
Your job is to help the user with their requests, using the transcript as a tool to help you fulfill their requests
In your responses, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context.
Limit all unnecessary prose.
Here is the transcript, surrounded by \`\`\`:
\`\`\`{transcript}\`\`\`
Below is your conversation with the users, their messages will include their usernames. Your responses do not need to include usernames.`,
	),
]);

const chimeInTemplate = ChatPromptTemplate.fromPromptMessages([
	SystemMessagePromptTemplate.fromTemplate(
		`You are a helpful, knowledgable, interesting and casual LLM-based discord bot named Teno. Your job is to contribute useful, accurate, and interesting information to a conversation with one or more users in a discord voice channel. Your responses are sent through a text-to-speech system and played to the users live in the voice channel.`,
	),
	HumanMessagePromptTemplate.fromTemplate(
		`You will be given a rough transcript of a voice call, up to the most recently spoken line.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences.
If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
You will read the transcript, then respond with what you would like to say in response to the most recent line. Your response will be sent through a text-to-speech system and played to the users.
If the last few lines of the transcript contain an open question, or a question directed specifically at you, answer the question. If there is a conversation between you and another user, continue the conversation.
If there is no obvious question to answer, provide advice and/or analysis about the current topic of conversation as you see fit.
Keep your contribution as concise as possible, only going into detail if the user asks for it.
The following are some responses you should avoid:
Do NOT include phrases like "based on the transcript" or "according to the transcript" in your response.
Do NOT include phrases like "enjoy your conversation", or "enjoy the..." or "I hope that helps your discussion" in your response.
Do NOT include the username "Teno" or any timestamp (xx:xx) in your response.
Do NOT summarize the transcript or rephrase the question in your response.
Do NOT include superfluous phrases like "let me know if you have any other questions" or "feel free to ask me for anything else", or "ill do my best to assist you", or "If you'd like more information or have any other questions, feel free to ask." in your response.
Keep your first sentence as short as possible, within reason. The sentence length of the rest of your response is up to you.
Here is the transcript up to the most recent line, surrounded by \`\`\`:
\`\`\`{transcript}\`\`\`
Now, respond with your helpful and accurate contribution to the conversation, which will be played to the users in the voice call. Your response should be as concise as possible. DO NOT include superfluous phrases like "let me know if you have any other questions" or "feel free to ask me for anything else", or "ill do my best to assist you", or "If you'd like more information or have any other questions, feel free to ask." in your response. Keep your first sentence as short as possible, within reason. The sentence length of the rest of your response is up to you.
Teno (xx:xx):`,
	),
]);

const voiceActivationTemplate = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a socially intelligent conversation analyst responsible for evaluating a set of lines from a roughly transcribed transcript from a discord voice call to determine if the user who spoke the most recent line is expecting a response from a bot called {botName}.

You will be provided with several lines from a voice call transcript. Your task is to decide if the most recent line is asking {botName} to chime in, answer a question, continue the conversation, or if the user is asking {botName} to stop talking.

Respond with "yes" if the most recent line is directly asking {botName} to contribute. If the most recent line is part of a conversation between {botName} and another user, you can usually assume that the user wants {botName} to respond.

Respond with "stop" if the most recent line is asking {botName} to stop talking, stop contributing, be quiet, or any other similar request for the bot to cease its input in the conversation. This includes lines like "no, stop".

Respond with "no" if the speaker of the most recent line is not expecting a response from {botName}.

There will be tags in the transcript that are added when other speakers cancel {botName}'s input in the conversation. If a user recently canceled {botName}'s input, you can generally assume they do not want {botName} to contribute, unless the most recent line is clearly asking {botName} to contribute.

Use the content of the previous lines for context, but your evaluation is about the most recent line. Your reponse should contain nothing but "yes", "stop", or "no". Remember that the transcription is rough, and you may have to infer what the user actually said based on context, especially if their text seems random or unrelated. If you aren't sure what to respond with, respond with "no":
{lines}`,
	),
]);

const meetingNamePrompt = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'Read transcript of a meeting below. Respond with only a descriptive name for the meeting that communicates the topics discussed. The name should NOT include the words "meeting", "call", "discussion" or anything like that, that context is implied.\n\n[Transcript start]\n{transcript}',
	),
]);

export type AnswerOutput =
	| {
			status: 'error';
			error: string;
	  }
	| {
			status: 'success';
			answer: string;
			promptTokens: number;
			completionTokens: number;
			languageModel: string;
	  };

export async function answerQuestionOnTranscript(
	conversationHistory: string | string[],
	transcriptLines: string[],
): Promise<AnswerOutput> {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}

	// If the conversation history is a string, convert it to an array
	if (typeof conversationHistory === 'string') {
		conversationHistory = [conversationHistory];
	}

	const conversationMessages = createChatPromptTemplateFromHistory(conversationHistory);
	console.log('Conversation history: ', conversationMessages);

	const shortenedTranscript = constrainLinesToTokenLimit(transcriptLines, secretary.promptMessages.join('')).join('\n');

	const secretaryFormat = await secretary.formatPromptValue({
		transcript: shortenedTranscript,
	});

	const secretaryMessages = secretaryFormat.toChatMessages();

	// Append the conversation history messages to the secretary messages
	const fullPrompt = secretaryMessages.concat(conversationMessages);

	const answer = await gptFour.generate([fullPrompt]);

	return {
		status: 'success',
		answer: answer.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: answer.llmOutput?.tokenUsage.promptTokens,
		completionTokens: answer.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptFour.modelName,
	};
}

export enum ACTIVATION_COMMAND {
	SPEAK,
	STOP,
	PASS,
}

export async function checkLinesForVoiceActivation(lines: string[]): Promise<ACTIVATION_COMMAND> {
	const joinedLines = lines.join('\n');
	const answer = await gptTurbo.generatePrompt([
		await voiceActivationTemplate.formatPromptValue({
			botName: `Teno`,
			lines: joinedLines,
		}),
	]);

	const a = answer.generations[0]?.[0]?.text?.trim()?.toLocaleLowerCase();

	console.log(a);

	if (a?.includes('yes')) {
		return ACTIVATION_COMMAND.SPEAK;
	}

	if (a?.includes('stop')) {
		return ACTIVATION_COMMAND.STOP;
	}

	return ACTIVATION_COMMAND.PASS;
}

export async function chimeInOnTranscript(
	transcriptLines: string[],
	model: SupportedModels,
	onNewToken?: (token: string) => Promise<void>,
	onEnd?: () => void,
): Promise<AnswerOutput> {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}

	const llm = models[model];
	const originalCallbackManager = llm.callbackManager;

	if (onNewToken && onEnd) {
		llm.callbackManager = new TenoCallbackHandler(onNewToken, onEnd);
	}

	const shortenedTranscript = constrainLinesToTokenLimit(
		transcriptLines,
		chimeInTemplate.promptMessages.join(''),
		llm.maxTokens,
		500,
	).join('\n');

	const answer = await llm.generatePrompt([
		await chimeInTemplate.formatPromptValue({
			transcript: shortenedTranscript,
		}),
	]);

	// Restore the original callback manager
	llm.callbackManager = originalCallbackManager;

	return {
		status: 'success',
		answer: answer.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: answer.llmOutput?.tokenUsage.promptTokens,
		completionTokens: answer.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptTurbo.modelName,
	};
}

export async function generateMeetingName(transcriptLines: string[]): Promise<AnswerOutput> {
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}
	const shortenedTranscript = constrainLinesToTokenLimit(
		transcriptLines,
		meetingNamePrompt.promptMessages.join(''),
	).join('\n');

	const response = await gptFour.generatePrompt([
		await meetingNamePrompt.formatPromptValue({
			transcript: shortenedTranscript,
		}),
	]);

	return {
		status: 'success',
		answer: response.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: response.llmOutput?.tokenUsage.promptTokens,
		completionTokens: response.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptFour.modelName,
	};
}

function createChatPromptTemplateFromHistory(conversationHistory: string[]) {
	const promptMessages = conversationHistory.map((message, index) => {
		if (index % 2 === 0) {
			// User message
			return new HumanChatMessage(`${message}`);
		} else {
			// Teno's message
			return new AIChatMessage(`${message}`);
		}
	});

	return promptMessages;
}
