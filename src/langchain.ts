// import { LLMChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models';
import { HumanMessagePromptTemplate, ChatPromptTemplate } from 'langchain/prompts';
// import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import { Config } from './config.js';

const model = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-3.5-turbo',
	openAIApiKey: Config.OPENAI_API_KEY,
});

const secretary = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'You are a secretary, and you will be given a rough transcript of a voice call. Your job is to read a transcript, then answer questions about it in a clear, concise manner. In your answer, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context. Limit all unnecessary prose.\n\nRead the following meeting transcript, then answer this question about the transcript: {question}.\n\n[Transcript start]\n{transcript}',
	),
]);

export async function answerQuestionOnTranscript(question: string, transcriptText: string | null) {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptText) {
		return 'No transcript found';
	}

	console.log('Transcript text: ', transcriptText);

	const answer = await model.generatePrompt([
		await secretary.formatPromptValue({
			question: question,
			transcript: transcriptText,
		}),
	]);
	return answer.generations[0]?.[0]?.text.trim() ?? 'No answer found';
}
