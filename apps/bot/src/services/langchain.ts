import { ChatOpenAI } from 'langchain/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, PromptTemplate } from 'langchain/prompts';
import { OpenAI, OpenAIChat } from 'langchain/llms';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { loadSummarizationChain } from 'langchain/chains';

import { constrainLinesToTokenLimit } from '@/utils/tokens.js';
import { Config } from '@/config.js';

const model = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-4',
	openAIApiKey: Config.OPENAI_API_KEY,
});

const tmp = `You are a helpful bot named Teno (might be transcribed ten o, tanno, tunnel, ect.), and you will be given a rough transcript of a voice call.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences. If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
Your job is to help the user with their requests, using the transcript as a tool to help you fulfill their requests
In your responses, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context.
Limit all unnecessary prose.
Here is the transcript, surrounded by \`\`\`:
\`\`\`{text}\`\`\`
Here is the user's username and request, surrounded by \`\`\`:
\`\`\`{question}\`\`\``;

const secretary = ChatPromptTemplate.fromPromptMessages([HumanMessagePromptTemplate.fromTemplate(tmp)]);

const summarizer = async (text: string, { question }: { question: string }) => {
	const model = new OpenAI({ temperature: 0.9, modelName: 'gpt-3.5-turbo' });
	const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 250 });
	const docs = await textSplitter.createDocuments([text]);
	const prompt = new PromptTemplate({
		template: tmp,
		inputVariables: ['question', 'text'],
	});

	// This convenience function creates a document chain prompted to summarize a set of documents.
	const chain = loadSummarizationChain(model, {
		prompt: await prompt.partial({ question }),
		type: 'stuff',
	});
	chain.verbose = true;
	const res = await chain.call({
		input_documents: docs,
	});

	return res?.text;
};

const meetingNamePrompt = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'Read transcript of a meeting below. Respond with only a descriptive name for the meeting that communicates the topics discussed. The name should NOT include the words "meeting", "call", "discussion" or anything like that, that context is implied.\n\n[Transcript start]\n{transcript}',
	),
]);

export async function answerQuestionOnTranscript(
	question: string,
	username: string,
	transcriptLines: string[],
): Promise<string | string[]> {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptLines || transcriptLines.length === 0) {
		return 'No transcript found';
	}

	// console.log(`${username}:`, question);
	// console.log('Transcript text: ', transcriptLines);

	const answer = await summarizer(transcriptLines.join('\n'), { question });
	if (!answer) {
		return 'No answer found';
	}
	if (answer.length >= 1900) {
		// while the answer is too long, cut it in half, save both halves in an array, and then check if the halves are too long
		// if they are, cut them in half and save them in the array, and so on
		// if they are not, return the halves
		const answerHalves: string[] = [answer];
		while (answerHalves.some((answerHalf) => answerHalf.length >= 1900)) {
			const answerHalf = answerHalves.pop();
			if (answerHalf) {
				const halfLength = Math.ceil(answerHalf.length / 2);
				answerHalves.push(answerHalf.slice(0, halfLength));
				answerHalves.push(answerHalf.slice(halfLength));
			}
		}
		return answerHalves;
	}

	return answer ?? 'No answer found';
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
