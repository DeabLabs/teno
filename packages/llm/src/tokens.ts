import { encoding_for_model } from '@dqbd/tiktoken';
import { SupportedModels, gptFour, gptTurbo16, modelTokenLimits, models } from './models.js';
import { ChatOpenAI } from 'langchain/chat_models';

// this is the tiktoken encoder that gpt-turbo uses
// https://github.com/dqbd/tiktoken/tree/main/js
export const messageEnc = encoding_for_model('gpt-4');

/**
 * Given a message, return the number of tokens
 *
 * @param message - message
 * @returns number of tokens
 */
export const countMessageTokens = (message: string) => messageEnc.encode(message).length;

/**
 * Given a list of messages, return the total number of tokens
 *
 * @param messages - list of messages
 * @returns total number of tokens
 */
export const sumMessageTokens = (messages: string[]) =>
	messages.reduce((acc, curr) => {
		return acc + countMessageTokens(curr);
	}, 0);

/**
 * Given a list of strings, and a prompt that will be sent with them, constrain the list by max token count
 *
 * @param lines - array of strings that should be converted to tokens and shortened, if necessary
 * @param prompt - prompt that will be sent with lines to openai
 * @param maxTokens - max number of tokens, defaults to 3500. 4096 is gpt-turbo's max but 3500 is a safe number to account
 *  for internal chatgpt prompt tokens
 * @param responseTokens - number of tokens to reserve for the response, defaults to 256
 * @returns list of messages that does not go over the max length of tokens
 */
export const constrainLinesToTokenLimit = (
	lines: string[],
	prompt: string | number,
	maxTokens = 4000,
	responseTokens = 1024,
) => {
	if (maxTokens < responseTokens) {
		throw new Error(`maxTokens (${maxTokens}) must be greater than responseTokens (${responseTokens})`);
	}

	const max = maxTokens - responseTokens;
	const promptTokenLength = typeof prompt === 'string' ? countMessageTokens(prompt) : prompt;
	const lineTokensLength = sumMessageTokens(lines);

	let tokens = promptTokenLength + lineTokensLength;

	// token length is fine, return everything
	if (tokens <= max) {
		console.log('Tokens used: ', tokens, '/ ', max);

		return lines;
	}

	// shorten the timeline by removing the oldest messages until tokens is under the max
	// we should not remove messages with a role of system, as they are important for the context
	const constrainedLines = lines.filter((line) => {
		if (tokens <= max) return true;

		tokens -= countMessageTokens(line);
		return false;
	});

	if (tokens > max) {
		console.error('Could not shorten messages enough to fit within max tokens');
	}

	console.log('Transcript was shortened to fit');
	console.log('Tokens used: ', tokens, '/ ', max);

	return constrainedLines;
};

// this many tokens will be reserved for the prompt when shortening the transcript
export const DEFAULT_PROMPT_TOKEN_BUFFER = 500;
export const DEFAULT_RESPONSE_TOKEN_BUFFER = 2000;

type Options = {
	forceModel?: SupportedModels;
	extraPromptBuffer?: number;
	promptTokenBuffer?: number;
	responseTokenBuffer?: number;
};

export const optimizeTranscriptModel = (
	transcriptLines: string[],
	options?: Options,
): { model: SupportedModels; llm: (token: string) => ChatOpenAI; shortenedTranscript: string[] } => {
	const { forceModel, extraPromptBuffer, promptTokenBuffer, responseTokenBuffer }: Options = {
		promptTokenBuffer: DEFAULT_PROMPT_TOKEN_BUFFER,
		responseTokenBuffer: DEFAULT_RESPONSE_TOKEN_BUFFER,
		...options,
	};
	const PROMPT_TOKENS = extraPromptBuffer ? promptTokenBuffer + extraPromptBuffer : promptTokenBuffer;

	if (forceModel) {
		return {
			model: forceModel,
			shortenedTranscript: constrainLinesToTokenLimit(
				transcriptLines,
				PROMPT_TOKENS,
				modelTokenLimits[forceModel],
				responseTokenBuffer,
			),
			llm: models[forceModel],
		};
	}

	// given some formatted prompt string, determine which model to use based on its size and available token limits
	const transcriptTokens = sumMessageTokens(transcriptLines);

	if (transcriptTokens <= modelTokenLimits['gpt-4'] - PROMPT_TOKENS - responseTokenBuffer) {
		console.log('Using gpt-4');
		return { model: 'gpt-4', shortenedTranscript: transcriptLines, llm: gptFour };
	}

	if (transcriptTokens <= modelTokenLimits['gpt-3.5-turbo-16k'] - PROMPT_TOKENS - responseTokenBuffer) {
		console.log('Using gpt-3.5-turbo-16k');
		return { model: 'gpt-3.5-turbo-16k', shortenedTranscript: transcriptLines, llm: gptTurbo16 };
	}

	console.log('Using gpt-3.5-turbo-16k, with shortened transcript');

	return {
		model: 'gpt-3.5-turbo-16k',
		shortenedTranscript: constrainLinesToTokenLimit(
			transcriptLines,
			PROMPT_TOKENS,
			modelTokenLimits['gpt-3.5-turbo-16k'],
			responseTokenBuffer,
		),
		llm: gptTurbo16,
	};
};
