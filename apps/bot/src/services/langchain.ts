import { ChatOpenAI } from 'langchain/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate } from 'langchain/prompts';
import type { LLMResult } from 'langchain/schema';
import { AIChatMessage, HumanChatMessage } from 'langchain/schema';
import { CallbackManager } from 'langchain/callbacks';

import { Config } from '@/config.js';
import { constrainLinesToTokenLimit } from '@/utils/tokens.js';

class TenoCallbackHandler extends CallbackManager {
	private tokenHandler: (token: string) => void;
	private endHandler: (output: LLMResult) => void;

	constructor(tokenHandler: (token: string) => void, endHandler: (output: LLMResult) => void) {
		super();
		this.tokenHandler = tokenHandler;
		this.endHandler = endHandler;
	}

	override handleLLMNewToken(token: string): Promise<void> {
		this.tokenHandler(token);
		return Promise.resolve();
	}

	override handleLLMEnd(output: LLMResult): Promise<void> {
		this.endHandler(output);
		return Promise.resolve();
	}
}

const gptFour = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-4',
	openAIApiKey: Config.OPENAI_API_KEY,
	streaming: true,
});

const gptTurbo = new ChatOpenAI({
	temperature: 0.9,
	modelName: 'gpt-3.5-turbo',
	openAIApiKey: Config.OPENAI_API_KEY,
	streaming: true,
});

const models = {
	'gpt-4': gptFour,
	'gpt-3.5-turbo': gptTurbo,
} as const;

export type SupportedModels = keyof typeof models;

const secretary = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences. If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
Your job is to help the user with their requests, using the transcript as a tool to help you fulfill their requests
In your responses, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context.
Limit all unnecessary prose.
Here is the transcript, surrounded by \`\`\`:
\`\`\`{transcript}\`\`\`
Below is your conversation with the users, their messages will include their usernames. Your responses do not need to include usernames.`,
	),
]);

const chimeInTemplate = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
The transcript contains one or many users, with each user's speaking turns separated by a newline.
Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
The transcript may include transcription errors, like mispelled words and broken sentences.
If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
You will read the transcript, then contribute to the conversation.
If the last few lines of the transcript contain an open question, or a question directed specifically at you, answer the question.
If there is no obvious question to answer, provide advice and/or analysis about the current topic of conversation as you see fit.
Do NOT include phrases like "based on the transcript" or "according to the transcript" in your response.
Do NOT include the username "Teno" or any timestamp (xx:xx) in your response.
Do NOT summarize the transcript or rephrase the question in your response.
Do NOT include superfluous phrases like "let me know if you have any other questions" or "feel free to ask me for anything else", or "ill do my best to assist you", or "If you'd like more information or have any other questions, feel free to ask." in your response.
Try to keep your first sentence as short as possible, within reason. The sentence length of the rest of your response is up to you.
Here is the transcript up to the moment the user asked you to chime in, surrounded by \`\`\`:
\`\`\`{transcript}\`\`\`
Teno (xx:xx):`,
	),
]);

const voiceActivationTemplate = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		`You are a helpful discord bot, and your name might be transcribed as Teno, ten o, tanno, tunnel, Tano, Tina, Loteno, To know, or other similar variations. You will be given several lines of a rough transcript of a voice call. Your task is to decide if the most recent line is asking you to chime in, answer a question, or contribute to the conversation directly.
  You should say "yes" if the most recent line is directly asking you to contribute, or if it is clear from the context that the user is expecting a response from you, even if your name is not explicitly mentioned. You should say "no" if there is an undirected question in the line, or if the line is a statement without an implicit request for your input, or if you were the last speaker. Use the content of the previous lines for context, but only look in the most recent line when deciding if the user is expecting a response. Never respond with anything other than "yes" or "no". If you aren't sure what to respond with, respond with "no".
  Here are some examples of conversations and what you should respond with:
  - Teno (08:00): The capital of France is Paris. If you have any other questions or need assistance, feel free to ask!
  - george (08:05): What about the capital of Germany?
  yes
  
  - Teno (08:30): A good book to read is "To Kill a Mockingbird" by Harper Lee. If you need more recommendations or assistance, just let me know!
  - sarah (08:35): Thanks! How many pages does it have?
  yes
  
  - Teno (09:00): The weather today is sunny with a high of 75°F. If you need more information or help with another topic, don't hesitate to ask!
  - jim (09:05): That's great! What about tomorrow's weather?
  yes
  
  - Teno (09:30): To fix a broken keyboard, you can try cleaning it, checking the connections, or replacing the faulty keys. If you need more help or have other questions, feel free to ask!
  - george (09:35): Thanks, Teno! Sarah, have you tried any of these methods before?
  no
  
  - Teno (10:00): You can improve your guitar skills by practicing regularly, learning music theory, and watching tutorials. If you need more tips or have any questions, just let me know!
  - sarah (10:05): That's helpful. Jim, did you find those tips useful too?
  no
  
  - Teno (10:30): A slow computer could be due to a virus, outdated software, or hardware issues. If you need assistance troubleshooting or have other questions, feel free to ask!
  - jim (10:35): I think I'll try updating my software first. How do I do that?
  yes
  
  - Teno (11:00): If your car won't start, it could be caused by a dead battery, a faulty ignition switch, or a problem with the starter. If you need more help or have other questions, don't hesitate to ask!
  - george (11:05): Thanks! Sarah, have you ever had this issue with your car?
  no
  
  - Teno (11:30): To choose a new laptop, consider factors like your budget, the operating system, performance, and portability. If you need help comparing models or have any questions, feel free to ask!
  - sarah (11:35): That's good to know. George, what's your budget for a new laptop?
  no
  
  - Teno (12:00): The movie "Inception" is a great choice for a movie night. If you need more recommendations or assistance, just let me know!
  - george (12:05): Thanks, Teno! Sarah, have you seen "Inception" before?
  no
  
  - Teno (12:30): To fix a broken guitar string, you'll need to remove the old string, thread a new one through the bridge and tuning peg, and then tune the guitar. If you need more help or have other questions, feel free to ask!
  - jim (12:35): Thanks for the advice! What type of strings should I buy?
  yes
  
  - george (00:25): What's the weather like today?
  - sarah (00:28): I don't know, maybe Teno knows?
  - jim (00:32): Yeah, what's the weather like, Tano?
  yes
  
  - george (00:36): Not respond.
  - Teno: (00:43): One plus one equals two. If

  - george (00:36): Not respond.
- Teno (00:43): One plus one equals two. If you have any other questions or need assistance with a different topic, feel free to ask!
- entmonk (00:43): Take it.
- cephalization (00:45): Back.
- entmonk (00:51): Hello tano. What is one plus one? Oh, so yeah. It's just transcription errors because the mic quality is bad when it's talking. Oh, okay. Okay.
yes

- george (01:15): I'm thinking of buying a new laptop.
- sarah (01:18): Oh, what brand are you considering?
- george (01:20): Not sure yet, any suggestions?
no

- jim (02:10): Does anyone know how to fix a broken keyboard?
- sarah (02:13): Maybe we should ask for Tano's help.
yes

- george (02:45): I can't find my glasses, have you seen them, sarah?
- sarah (02:48): No, sorry. Maybe check in the living room?
no

- jim (03:30): What's the capital of France?
- sarah (03:33): I think it's Paris.
- jim (03:35): Can anyone confirm that?
yes

- george (04:12): My car won't start, any idea what the issue might be?
- sarah (04:15): I'm not sure, but it could be the battery.
- jim (04:18): Yeah, you should get it checked out.
no

- sarah (05:00): I need a recommendation for a good book to read. Tina, any suggestions?
yes

- george (05:45): I'm trying to learn how to play guitar, any tips?
- jim (05:48): Just keep practicing and don't give up.
- sarah (05:50): Yeah, and maybe watch some tutorials on YouTube.
no

- jim (06:30): My computer is running slow, what could be the problem?
- sarah (06:33): Maybe it's a virus or you need to update your software.
- jim (06:36): I'm not sure. Can someone help me figure it out?
yes

- george (07:10): Hey sarah, do you want to watch a movie tonight?
- sarah (07:13): Sure, what movie do you have in mind?
- george (07:15): I don't know, I was hoping you could pick one.
no

- Teno (13:00): The best way to update your software depends on your operating system. If you're using Windows, you can go to Settings > Update & Security > Windows Update. For macOS, go to System Preferences > Software Update. If you need more help or have other questions, feel free to ask!
- jim (13:05): What about updating software on Linux?
yes

- Teno (13:30): A great brand for laptops is Dell. They offer a wide range of options, from budget-friendly models to high-performance machines. If you need help comparing models or have any questions, feel free to ask!
- george (13:35): Thanks, Loteno. Sarah, have you ever owned a Dell laptop?
no

- Teno (14:00): The weather tomorrow will be partly cloudy with a high of 68°F. If you need more information or help with another topic, don't hesitate to ask!
- jim (14:05): Thanks, To know! George, are you still planning on having a picnic tomorrow?
no

- Teno (14:30): You can find guitar strings at most music stores or online retailers like Amazon. Some popular brands include Ernie Ball, D'Addario, and Elixir. If you need more help or have other questions, feel free to ask!
- sarah (14:35): Thank you, tunnel! Jim, which brand do you usually use for your guitar?
no

- Teno (16:00): If you're considering a movie night, I recommend "The Shawshank Redemption." If you need more recommendations or assistance, just let me know!
- sarah (16:05): Thanks, ten o! George, have you seen "The Shawshank Redemption" before?
no

- Teno (16:30): To choose a new laptop, consider factors like your budget, the operating system, performance, and portability. If you need help comparing models or have any questions, feel free to ask!
- george (16:35): That's helpful, Bot. Sarah, what's your budget for a new laptop?
no

- Teno (17:00): If your car won't start, it could be caused by a dead battery, a faulty ignition switch, or a problem with the starter. If you need more help or have other questions, don't hesitate to ask!
- jim (17:05): Thanks, Bot. Sarah, have you ever had this issue with your car?
no

- Teno (17:30): The best way to learn a new language is through consistent practice, immersion, and using resources like language apps or books. If you need more tips or have any questions, just let me know!
- sarah (17:35): Thanks, Bot. George, do you have any other tips for learning a new language?
no

  Here are the lines you should classify, surrounded by \`\`\`. Respond with "yes" or "no" based on the criteria above:
  \`\`\`{lines}\`\`\`
  `,
	),
]);

const meetingNamePrompt = ChatPromptTemplate.fromPromptMessages([
	HumanMessagePromptTemplate.fromTemplate(
		'Read transcript of a meeting below. Respond with only a descriptive name for the meeting that communicates the topics discussed. The name should NOT include the words "meeting", "call", "discussion" or anything like that, that context is implied.\n\n[Transcript start]\n{transcript}',
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
		return { status: 'error', error: 'No transcript found' };
	}

	// If the conversation history is a string, convert it to an array
	if (typeof conversationHistory === 'string') {
		conversationHistory = [conversationHistory];
	}

	const conversationMessages = createChatPromptTemplateFromHistory(conversationHistory);
	console.log('Conversation history: ', conversationMessages);

	const shortenedTranscript = constrainLinesToTokenLimit(transcriptLines, secretary.promptMessages.join('')).join('\n');

	const secretaryFormat = await secretary.formatPromptValue({
		transcript: shortenedTranscript,
	});

	const secretaryMessages = secretaryFormat.toChatMessages();

	// Append the conversation history messages to the secretary messages
	const fullPrompt = secretaryMessages.concat(conversationMessages);

	const answer = await gptFour.generate([fullPrompt]);

	return {
		status: 'success',
		answer: answer.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: answer.llmOutput?.tokenUsage.promptTokens,
		completionTokens: answer.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptFour.modelName,
	};
}

export async function checkLinesForVoiceActivation(lines: string[]): Promise<boolean> {
	const joinedLines = lines.join('\n');
	const answer = await gptTurbo.generatePrompt([
		await voiceActivationTemplate.formatPromptValue({
			lines: joinedLines,
		}),
	]);

	const a = answer.generations[0]?.[0]?.text?.trim()?.toLocaleLowerCase();

	console.log(a);

	return a?.includes('yes') ?? false;
}

export async function chimeInOnTranscript(
	transcriptLines: string[],
	model: SupportedModels,
	onNewToken?: (token: string) => void,
	onEnd?: () => void,
): Promise<AnswerOutput> {
	// Return the contents of the file at the given filepath as a string
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}

	const llm = models[model];
	const originalCallbackManager = llm.callbackManager;

	if (onNewToken && onEnd) {
		llm.callbackManager = new TenoCallbackHandler(onNewToken, onEnd);
	}

	const shortenedTranscript = constrainLinesToTokenLimit(
		transcriptLines,
		chimeInTemplate.promptMessages.join(''),
		llm.maxTokens,
		500,
	).join('\n');

	const answer = await llm.generatePrompt([
		await chimeInTemplate.formatPromptValue({
			transcript: shortenedTranscript,
		}),
	]);

	// Restore the original callback manager
	llm.callbackManager = originalCallbackManager;

	return {
		status: 'success',
		answer: answer.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: answer.llmOutput?.tokenUsage.promptTokens,
		completionTokens: answer.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptFour.modelName,
	};
}

export async function generateMeetingName(transcriptLines: string[]): Promise<AnswerOutput> {
	if (!transcriptLines || transcriptLines.length === 0) {
		return { status: 'error', error: 'No transcript found' };
	}
	const shortenedTranscript = constrainLinesToTokenLimit(
		transcriptLines,
		meetingNamePrompt.promptMessages.join(''),
	).join('\n');

	const response = await gptFour.generatePrompt([
		await meetingNamePrompt.formatPromptValue({
			transcript: shortenedTranscript,
		}),
	]);

	return {
		status: 'success',
		answer: response.generations[0]?.[0]?.text.trim() ?? 'No answer found',
		promptTokens: response.llmOutput?.tokenUsage.promptTokens,
		completionTokens: response.llmOutput?.tokenUsage.completionTokens,
		languageModel: gptFour.modelName,
	};
}

function createChatPromptTemplateFromHistory(conversationHistory: string[]) {
	const promptMessages = conversationHistory.map((message, index) => {
		if (index % 2 === 0) {
			// User message
			return new HumanChatMessage(`${message}`);
		} else {
			// Teno's message
			return new AIChatMessage(`${message}`);
		}
	});

	return promptMessages;
}
