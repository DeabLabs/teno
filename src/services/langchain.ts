import type { Encoding } from 'crypto';

import { ChatOpenAI } from 'langchain/chat_models';
import { ChatVectorDBQAChain, ConversationalRetrievalQAChain } from 'langchain/chains';
import { ChatPromptTemplate, HumanMessagePromptTemplate } from 'langchain/prompts';
import { encoding_for_model } from '@dqbd/tiktoken';
import type { Collection } from 'chromadb';
import { Chroma } from 'langchain/vectorstores';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { OpenAI } from 'langchain/llms';
import type { ChainValues } from 'langchain/schema';

import { Config } from '@/config.js';

const gptFourEncoding = encoding_for_model('gpt-4');

const model = new OpenAI({
	temperature: 0.9,
	modelName: 'gpt-4',
	openAIApiKey: Config.OPENAI_API_KEY,
});

const secretary = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'You are a secretary bot named Teno (might be transcribed ten o, tanno, tunnel, ect.), and you will be given a rough transcript of a voice call. The transcript may include transcription errors. Your job is to read a transcript, then answer questions about it in a clear, concise manner. In your answer, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context. Limit all unnecessary prose.\n\nRead the following meeting transcript, then answer this question about the transcript: {question}.\n\n[Transcript start]\n{transcript}',
	),
]);

export async function answerQuestionOnTranscript(question: string, transcriptText: string | null) {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptText) {
		return 'No transcript found';
	}

	const shortenedTranscriptText = stripQueryForEightK(transcriptText, secretary, question);

	const answer = await model.generatePrompt([
		await secretary.formatPromptValue({
			question: question,
			transcript: shortenedTranscriptText,
		}),
	]);
	return answer.generations[0]?.[0]?.text.trim() ?? 'No answer found';
}

/**
 * Given a message, return the number of tokens
 *
 * @param message - message
 * @returns number of tokens
 */
export const countStringTokens = (string: string) => gptFourEncoding.encode(string).length;

/**
 * Given a list of messages, return the total number of tokens
 *
 * @param messages - list of messages
 * @returns total number of tokens
 */
// export const countArrayTokens = (strings: string[], encoding:Tiktoken) =>
// 	strings.reduce((acc, curr) => {
// 		return acc + countStringTokens(curr);
// 	}, 0);

export function stripQueryForEightK(transcript: string, prompt: ChatPromptTemplate, question: string): string {
	const tokenLimit = 7600;
	// console.log('Transcript text:\n', transcript);

	const transcriptArray = transcript.split('\n').reverse();

	const promptString = secretary.promptMessages.toString();
	const promptTokens = gptFourEncoding.encode(promptString);

	const questionTokens = gptFourEncoding.encode(question);

	const linesToSend: string[] = [];
	let tokensSent = 0;

	for (const line of transcriptArray) {
		const lineTokens = gptFourEncoding.encode(line);
		if (tokensSent + lineTokens.length + promptTokens.length + questionTokens.length > tokenLimit) {
			break;
		}
		linesToSend.unshift(line);
		tokensSent += lineTokens.length;
	}

	const stringLines = linesToSend.join('\n');
	// console.log('Shortened transcript:\n', stringLines);
	return stringLines;
}

export async function qaOnVectorstores(collection: Collection, question: string): Promise<ChainValues> {
	const collectionName = collection.name;
	const vectorStore = await Chroma.fromExistingCollection(new OpenAIEmbeddings(), {
		collectionName: collectionName,
	});

	const chain = ConversationalRetrievalQAChain.fromLLM(model, vectorStore.asRetriever());
	const answer = await chain.call({ question, chat_history: [] });
	return answer.text;
}
