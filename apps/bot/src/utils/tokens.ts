import { encoding_for_model } from '@dqbd/tiktoken';

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
	prompt: string,
	maxTokens = 4000,
	responseTokens = 1024,
) => {
	if (maxTokens < responseTokens) {
		throw new Error(`maxTokens (${maxTokens}) must be greater than responseTokens (${responseTokens})`);
	}

	const max = maxTokens - responseTokens;
	const promptTokenLength = countMessageTokens(prompt);
	const lineTokensLength = sumMessageTokens(lines);

	let tokens = promptTokenLength + lineTokensLength;

	// token length is fine, return everything
	if (tokens <= max) {
		console.log('Transcript fits');
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
		throw new Error('Could not shorten messages enough to fit within max tokens');
	}

	console.log('Transcript was shortened to fit');
	console.log('Tokens used: ', tokens, '/ ', max);

	return constrainedLines;
};
