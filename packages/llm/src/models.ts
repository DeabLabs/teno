import { ChatOpenAI } from 'langchain/chat_models/openai';

export const gptFour = (token: string) =>
	new ChatOpenAI({
		temperature: 0.9,
		modelName: 'gpt-4',
		openAIApiKey: token,
	});

export const gptTurbo = (token: string) =>
	new ChatOpenAI({
		temperature: 0.9,
		modelName: 'gpt-3.5-turbo',
		openAIApiKey: token,
	});

export const gptTurbo16 = (token: string) =>
	new ChatOpenAI({
		temperature: 0.9,
		modelName: 'gpt-3.5-turbo-16k',
		openAIApiKey: token,
	});

export const models = {
	'gpt-4': gptFour,
	'gpt-3.5-turbo': gptTurbo,
	'gpt-3.5-turbo-16k': gptTurbo16,
} as const;

export const modelTokenLimits = {
	'gpt-4': 8000,
	'gpt-3.5-turbo': 4000,
	'gpt-3.5-turbo-16k': 16000,
} as const;

export type SupportedModels = keyof typeof models;
