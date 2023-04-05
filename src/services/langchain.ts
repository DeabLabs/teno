// import { LLMChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate } from 'langchain/prompts';

// import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import { Config } from '@/config.js';
import { constrainLinesToTokenLimit } from '@/utils/tokens.js';

const model = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-4',
	openAIApiKey: Config.OPENAI_API_KEY,
});

const secretary = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'You are a secretary bot named Teno (might be transcribed ten o, tanno, tunnel, ect.), and you will be given a rough transcript of a voice call. The transcript may include transcription errors. Your job is to read a transcript, then answer questions about it in a clear, concise manner. In your answer, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context. Limit all unnecessary prose.\n\nRead the following meeting transcript, then answer this question about the transcript: {question}.\n\n[Transcript start]\n{transcript}',
	),
]);

const meetingNamePrompt = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'Read transcript of a meeting below. Respond with only a descriptive name for the meeting that communicates the topics discussed. The name should NOT include the words "meeting", "call", "discussion" or anything like that, that context is implied.\n\n[Transcript start]\n{transcript}',
	),
]);

export async function answerQuestionOnTranscript(question: string, transcriptLines: string[]) {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptLines || transcriptLines.length === 0) {
		return 'No transcript found';
	}

	console.log('Question: ', question);
	console.log('Transcript text: ', transcriptLines);

	const shortenedTranscript = constrainLinesToTokenLimit(transcriptLines, secretary.promptMessages.join('')).join('\n');

	const answer = await model.generatePrompt([
		await secretary.formatPromptValue({
			question: question,
			transcript: shortenedTranscript,
		}),
	]);
	return answer.generations[0]?.[0]?.text.trim() ?? 'No answer found';
}

export async function generateMeetingName(transcriptLines: string[]): Promise<string> {
	if (!transcriptLines || transcriptLines.length === 0) {
		return 'No transcript found';
	}
	const shortenedTranscript = constrainLinesToTokenLimit(
		transcriptLines,
		meetingNamePrompt.promptMessages.join(''),
	).join('\n');

	console.log('Transcript text: ', transcriptLines);

	const response = await model.generatePrompt([
		await meetingNamePrompt.formatPromptValue({
			transcript: shortenedTranscript,
		}),
	]);
	return response.generations[0]?.[0]?.text.trim() ?? 'No name found';
}
