import type { ActionArgs, LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { z } from 'zod';
import { Configuration, OpenAIApi } from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Chat } from '@/components/chat';
import { Config } from '@/server/config.server';

/**
 * - Link to individual meeting ✅
 * - individual meeting page ✅
 * - style the page
 * - conversation action so people can talk with transcript
 * - fetch transcript for download (stretch goal)
 */

export const loader = async ({ params, request }: LoaderArgs) => {
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
	});

	const safeMeeting = z.object({
		name: z.string(),
	});

	return json({
		id: params.id,
		meeting: safeMeeting.parse(meeting),
	});
};

// export const action = async ({ request }: ActionArgs) => {
// 	// TODO conversate with the transcript
// 	const { messages } = await request.json();

// 	console.log({ messages, key: Config.OPENAI_API_KEY });

// 	const config = new Configuration({
// 		apiKey: Config.OPENAI_API_KEY,
// 	});
// 	const openai = new OpenAIApi(config, undefined, );

// 	const response = await openai.createChatCompletion({
// 		model: 'gpt-3.5-turbo',
// 		messages,
// 		stream: true,
// 	});

// 	const stream = OpenAIStream(response);
// 	return new StreamingTextResponse(stream);
// };

const DashboardMeeting = () => {
	const { meeting } = useLoaderData<typeof loader>();

	console.log({ meeting });

	return (
		<div className="flex flex-col w-full gap-8">
			<Chat meeting={meeting} />
		</div>
	);
};

export default DashboardMeeting;
