import { ChatPromptTemplate, HumanMessagePromptTemplate } from 'langchain/prompts';
import {
	DEFAULT_RESPONSE_TOKEN_BUFFER,
	countMessageTokens,
	modelTokenLimits,
	optimizeTranscriptModel,
	sumMessageTokens,
} from 'llm';

import { Config } from '@/config.js';

const openAIApiKey = Config.OPENAI_API_KEY;

const secretary = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences. If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
Your job is to help the user with their requests, using the transcript as a tool to help you fulfill their requests
In your responses, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context.
Limit all unnecessary prose.
Here is the transcript so far, surrounded by \`\`\`:
\`\`\`{transcript}\`\`\`
Below is your conversation with the users about the meeting, respond with your next message:
{conversationHistory}
Teno:`,
	),
]);

const meetingNamePrompt = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'Read transcript of a meeting below. Respond with only a descriptive name for the meeting that communicates the topics discussed. The name should NOT include the words "meeting", "call", "discussion" or anything like that, that context is implied. Do not include quotes around the meeting name, only respond with the name itself.\n\n[Transcript start]\n{transcript}',
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
		transcriptLines = ['Empty transcript'];
		console.error('(Empty transcript)');
	}

	// If the conversation history is a string, convert it to an array
	if (typeof conversationHistory === 'string') {
		conversationHistory = [conversationHistory];
	}

	const conversationHistoryString = conversationHistory.join('\n');

	const { llm, shortenedTranscript, model } = optimizeTranscriptModel(transcriptLines, {
		extraPromptBuffer: countMessageTokens(conversationHistoryString),
	});

	let secretaryFormat = await secretary.formatPromptValue({
		transcript: shortenedTranscript,
		conversationHistory: conversationHistoryString,
	});

	if (countMessageTokens(secretaryFormat.toString()) > modelTokenLimits[model] - DEFAULT_RESPONSE_TOKEN_BUFFER) {
		console.log('shortening conversation history');
		const { shortenedTranscript: shortenedConversationHistory } = optimizeTranscriptModel(conversationHistory, {
			extraPromptBuffer: sumMessageTokens(shortenedTranscript),
		});
		secretaryFormat = await secretary.formatPromptValue({
			transcript: shortenedTranscript,
			conversationHistory: shortenedConversationHistory,
		});
	}

	console.log(countMessageTokens(secretaryFormat.toString()));

	const secretaryMessages = secretaryFormat.toChatMessages();

	const client = llm(openAIApiKey);
	const answer = await client.generate([secretaryMessages]);

	return {
		status: 'success',
		answer: answer.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: answer.llmOutput?.tokenUsage.promptTokens,
		completionTokens: answer.llmOutput?.tokenUsage.completionTokens,
		languageModel: client.modelName,
	};
}

export enum ACTIVATION_COMMAND {
	SPEAK,
	STOP,
	PASS,
}

export async function generateMeetingName(transcriptLines: string[]): Promise<AnswerOutput> {
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}

	const { llm, shortenedTranscript, model } = optimizeTranscriptModel(transcriptLines);

	const client = llm(openAIApiKey);
	const response = await client.generatePrompt([
		await meetingNamePrompt.formatPromptValue({
			transcript: shortenedTranscript,
		}),
	]);

	return {
		status: 'success',
		answer: response.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: response.llmOutput?.tokenUsage.promptTokens,
		completionTokens: response.llmOutput?.tokenUsage.completionTokens,
		languageModel: model,
	};
}
