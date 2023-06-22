import type { ActionArgs } from '@vercel/remix';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { transcriptQueries } from 'kv';
import { createRedisClient } from 'kv';
import { Configuration, OpenAIApi } from 'openai-edge';
import { z } from 'zod';

import { constrainLinesToTokenLimit } from '@/server/tokens.server';

const oConfig = new Configuration({
	apiKey: process.env.OPENAI_API_KEY ?? '',
});
const openai = new OpenAIApi(oConfig);

// Initialize Redis client
const redisClient = createRedisClient(process.env.REDIS_URL ?? '', {
	lazyConnect: true,
});

redisClient.on('error', (err) => {
	console.log('Redis Client Error', err);
});

export const action = async ({ request }: ActionArgs) => {
	const { messages, transcriptId } = z
		.object({
			messages: z.array(
				z
					.object({
						content: z.string(),
						role: z.union([z.literal('user'), z.literal('system'), z.literal('assistant')]),
					})
					.passthrough(),
			),
			transcriptId: z.string(),
		})
		.parse(await request.json());

	// Load transcript set from Redis, turn it into a string
	const transcriptArray = await transcriptQueries.getTranscriptArray(redisClient, { transcriptKey: transcriptId });
	const transcript = transcriptArray;
	const prompt = `You are a helpful discord bot named Teno (might be transcribed "ten o", "tanno", "tunnel", ect.), and you will be given a rough transcript of a voice call.
  The transcript contains one or many users, with each user's speaking turns separated by a newline.
  Each line also contains the user's name, how many seconds into the call they spoke, and the text they spoke.
  The transcript may include transcription errors, like mispelled words and broken sentences. If a user asks for quotes, you are encouraged to edit the quotes for transcription errors based on context as you see fit.
  Your job is to help the user with their requests, using the transcript as a tool to help you fulfill their requests
  In your responses, DO NOT include phrases like "based on the transcript" or "according to the transcript", the user already understands the context.
  Limit all unnecessary prose.
  Here is the transcript so far, surrounded by \`\`\`:
  \`\`\`{transcript}\`\`\``;
	const content = prompt.replace('{transcript}', constrainLinesToTokenLimit(transcript, prompt, 6000).join('\n'));

	const newMessages = [
		{
			role: 'system',
			content,
		},
		...messages,
	] as const;

	const response = await openai.createChatCompletion({
		// model: 'gpt-3.5-turbo-16k',
		model: 'gpt-4',
		// @ts-expect-error
		messages: newMessages,
		stream: true,
	});
	const stream = OpenAIStream(response);

	return new StreamingTextResponse(stream);
};
