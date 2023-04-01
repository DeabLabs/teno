// import { LLMChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate } from 'langchain/prompts';

// import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import { Config } from '@/config.js';

const gptFour = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-4',
	openAIApiKey: Config.OPENAI_API_KEY,
});

const gptTurbo = new ChatOpenAI({
	temperature: 0.0,
	modelName: 'gpt-3.5-turbo',
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

	console.log('Transcript text: ', transcriptText);

	const answer = await gptFour.generatePrompt([
		await secretary.formatPromptValue({
			question: question,
			transcript: transcriptText,
		}),
	]);
	return answer.generations[0]?.[0]?.text.trim() ?? 'No answer found';
}

// Add this function to your langchain.ts file

export async function cleanDialogue(
	lastCleanedLines: string[],
	lastUncleanedLines: string[],
	proprietaryTerms: string[] = [],
) {
	const cleaningPrompt = `You are a language model and your task is to clean the output of an automatic transcription system by fixing transcription errors where possible and concatenating lines of dialogue when it makes sense. Use context to infer when words were transcribed incorrectly, and replace with more likely words and phrases as needed. Ensure that the cleaned lines of dialogue include the speaker, timestamp, and the dialogue separated by a single newline. Keep in mind these terms that may not be in the transcription systems's training data, and thus may be transcribed as similar-sounding words or phrases: Teno (may be transcribed as tunnel, ten o, tanno), {proprietaryTerms}. For example, the cleaned output should be structured like this:\n\nspeaker1 (04:32): Line 1 of dialogue\nspeaker2 (04:35): Line 2 of dialogue\nspeaker1 (04:40): Line 3 of dialogue\n\nand so on.`;

	const cleaningTemplate = ChatPromptTemplate.fromPromptMessages([
		HumanMessagePromptTemplate.fromTemplate(
			`${cleaningPrompt}\n\nCleaned lines:\n{cleanedLines}\n\nUncleaned lines:\n{uncleanedLines}`,
		),
	]);

	const formattedPrompt = await cleaningTemplate.formatPromptValue({
		proprietaryTerms: proprietaryTerms.join(', '),
		cleanedLines: lastCleanedLines.map((line) => line.trim().replace(/\n/g, '')).join('\n'),
		uncleanedLines: lastUncleanedLines.map((line) => line.trim().replace(/\n/g, '')).join('\n'),
	});

	const answer = await gptTurbo.generatePrompt([formattedPrompt]);

	const cleanedText = answer.generations[0]?.[0]?.text.trim() ?? '';

	// You can split the cleaned text into an array of strings based on your desired separator, e.g., newline character
	return cleanedText.split('\n');
}
