// import { LLMChain } from 'langchain/chains';
import { promises as fsPromises } from 'fs';
import { ChatOpenAI } from 'langchain/chat_models';
import { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } from 'langchain/prompts';
// import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import { Config } from './config.js';

const model = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-3.5-turbo',
	openAIApiKey: Config.get('OPENAI_API_KEY')!,
});

const secretary = ChatPromptTemplate.fromPromptMessages([
	SystemMessagePromptTemplate.fromTemplate(
		'You are a neutral secretary, you are responsible for answering questions about the transcript of a meeting. Your job is to read a transcript, then answer questions about it in a clear, concise manner.',
	),
	HumanMessagePromptTemplate.fromTemplate(
		'Read the following meeting transcript, then answer this question about the transcript: {question}.\n\n{transcript}',
	),
]);

export async function answerQuestionOnTranscript(question: string, transcriptFilePath: string) {
	// Return the contents of the file at the given filepath as a string
	const contents = await fsPromises.readFile(transcriptFilePath, 'utf-8');

	const answer = await model.generatePrompt([
		await secretary.formatPromptValue({
			question: question,
			transcript: contents,
		}),
	]);
	return answer.generations[0]?.[0]?.text.trim() ?? 'No answer found';
}
