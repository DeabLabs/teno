import { ChatOpenAI } from 'langchain/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate } from 'langchain/prompts';
import { AIChatMessage, HumanChatMessage } from 'langchain/schema';
import { CallbackManager } from 'langchain/callbacks';

import { Config } from '@/config.js';
import { constrainLinesToTokenLimit } from '@/utils/tokens.js';

class TenoCallbackHandler extends CallbackManager {
	private tokenHandler: (token: string) => void;

	constructor(tokenHandler: (token: string) => void) {
		super();
		this.tokenHandler = tokenHandler;
	}

	override handleLLMNewToken(token: string, verbose?: boolean | undefined): Promise<void> {
		this.tokenHandler(token);
		return Promise.resolve();
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
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences.
If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
You will read the transcript, then contribute to the conversation.
If the last few lines of the transcript contain an open question, or a question directed specifically at you, answer the question.
If there is no obvious question to answer, provide advice and/or analysis about the current topic of conversation as you see fit.
Do NOT include phrases like "based on the transcript" or "according to the transcript" in your response.
Do NOT include the username "Teno" or any timestamp (xx:xx) in your response.
Do NOT summarize the transcript or rephrase the question in your response.
Do NOT include phrases like "let me know if you have any other questions" or "feel free to ask me for anything else", or "ill do my best to assist you", in your response.
Here is the transcript up to the moment the user asked you to chime in, surrounded by \`\`\`:
\`\`\`{transcript}\`\`\`
Teno (xx:xx):`,
	),
]);

const voiceActivationTemplate = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a single line of a rough transcript of a voice call.
Decide if this line is asking you to chime in, answer a question, or contribute to the conversation directly.
You should only say "yes" if the line is directly asking you to contribute. You should not say "yes" if there is an undirected question in the line, or if the line is a statement.
Here are some examples lines and what a correct response would be:
- "ten O, what do you think about this?"
- "yes"
- "Teno, what do you think about this?"
- "yes"
- "Teno, can you help me with this?"
- "yes"
- "What does the bot think?"
- "yes"
- "Does Teno have an opinion on this?"
- "yes"
- "I wonder how Teno would respond to this"
- "yes"
- "I wonder how tunnel would respond to this"
- "yes"
- "Teno respond"
- "yes"
- "tunnel, respond"
- "yes"
- "What do we think about this?"
- "no"
- "What do you think about this?"
- "no"
- "I think Teno would say this"
- "no"
- "Bot, respond"
- "yes"
Here is the line you should classify, surrounded by \`\`\`. Respond with "yes" or "no" based on the criteria and examples above:
\`\`\`{line}\`\`\`
`,
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

	console.log('Transcript text: ', shortenedTranscript);

	console.log(fullPrompt);

	const answer = await gptFour.generate([fullPrompt]);

	return {
		status: 'success',
		answer: answer.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: answer.llmOutput?.tokenUsage.promptTokens,
		completionTokens: answer.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptFour.modelName,
	};
}

export async function triggerVoiceActivation(utterance: string): Promise<boolean> {
	const answer = await gptTurbo.generatePrompt([
		await voiceActivationTemplate.formatPromptValue({
			line: utterance,
		}),
	]);

	const a = answer.generations[0]?.[0]?.text?.trim()?.toLocaleLowerCase();

	console.log(a);

	return a?.includes('yes') ?? false;
}

export async function chimeInOnTranscript(
	transcriptLines: string[],
	model: SupportedModels,
	onNewToken?: (token: string) => void,
): Promise<AnswerOutput> {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}

	const llm = models[model];
	const originalCallbackManager = llm.callbackManager;

	if (onNewToken) {
		llm.callbackManager = new TenoCallbackHandler(onNewToken);
	}

	const shortenedTranscript = constrainLinesToTokenLimit(
		transcriptLines,
		chimeInTemplate.promptMessages.join(''),
		llm.maxTokens,
		500,
	).join('\n');

	console.log('Transcript text: ', shortenedTranscript);

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
		languageModel: gptFour.modelName,
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

	console.log('Transcript text: ', transcriptLines);

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
