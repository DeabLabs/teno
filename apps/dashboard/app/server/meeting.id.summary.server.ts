import type { LoaderArgs } from '@vercel/remix';
import { defer } from '@vercel/remix';
import { z } from 'zod';
import { countMessageTokens, optimizeTranscriptModel } from 'llm';
import type { ChatCompletionRequestMessage } from 'openai-edge';
import { Configuration, OpenAIApi } from 'openai-edge';

import { checkAuth } from './auth.utils.server';
import { prisma } from './database.server';
import { transcriptQueries, redis } from './kv.server';

export const generateSummaries = async <T extends LoaderArgs>({ request, params }: T) => {
	const user = await checkAuth(request);

	const id = z.coerce.number().parse(params.id);

	const meeting = await prisma.meeting.findFirst({
		where: {
			id,
			attendees: {
				some: {
					id: user.id,
				},
			},
		},
		include: {
			transcript: {
				select: {
					redisKey: true,
				},
			},
		},
	});

	const safeMeeting = z.object({
		id: z.number(),
		name: z.string(),
		transcript: z.object({
			redisKey: z.string(),
		}),
	});

	const parsedMeeting = safeMeeting.parse(meeting);

	const transcriptArray = await transcriptQueries.getTranscriptArray(redis, {
		transcriptKey: parsedMeeting.transcript.redisKey,
	});
	const transcript = transcriptArray;
	const prompt = `You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
  The transcript contains one or many users, which may include you, with each user's speaking turns separated by a newline.
  Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
  The transcript may include transcription errors, like mispelled words and broken sentences. If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
  Your job is to help the user with their requests, using the transcript as a tool to help you fulfill their requests
  In your responses, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context.
  Here is the transcript so far, surrounded by \`\`\`:
  \`\`\`{transcript}\`\`\``;
	const { model, shortenedTranscript } = optimizeTranscriptModel(transcript, {
		promptTokenBuffer: countMessageTokens(prompt),
	});
	const content = prompt.replace('{transcript}', shortenedTranscript.join('\n'));

	const newMessages: ChatCompletionRequestMessage[] = [
		{
			role: 'system',
			content,
		},
	];

	const oConfig = new Configuration({
		apiKey: process.env.OPENAI_API_KEY ?? '',
	});
	const openai = new OpenAIApi(oConfig);

	const summary = openai
		.createChatCompletion({
			model,
			messages: [
				...newMessages,
				{
					role: 'user',
					content:
						'Can you provide a high level summary of this meeting, by topic? Only return a list of summary items starting with -. Separate each item with a newline. Do not add any other text',
				},
			],
		})
		.then((res) => res.json())
		.then((body) => (body.choices?.[0]?.message?.content?.trim() as string) || 'Could not generate a meeting summary.');

	const actionItems = openai
		.createChatCompletion({
			model,
			messages: [
				...newMessages,
				{
					role: 'user',
					content:
						'Can you list the action items for this meeting? Only return a list of action items starting with - and ending with a newline. Do not add any other text. If there are no action items, return empty space',
				},
			],
		})
		.then((res) => res.json())
		.then(
			(body) => (body.choices?.[0]?.message?.content?.trim() as string) || 'Could not generate a list of action items.',
		);

	const attendees = openai
		.createChatCompletion({
			model,
			messages: [
				...newMessages,
				{
					role: 'user',
					content:
						'List the attendees of this meeting. Only display their usernames in a list, starting with - and ending in newlines. Do not add any other text.',
				},
			],
		})
		.then((res) => res.json())
		.then(
			(body) => (body.choices?.[0]?.message?.content?.trim() as string) || 'Could not generate a list of attendees.',
		);

	return defer({
		summary,
		attendees,
		actionItems,
	});
};
