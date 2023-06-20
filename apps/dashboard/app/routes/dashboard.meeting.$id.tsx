import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { z } from 'zod';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Chat } from '@/components/chat';

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
		include: {
			transcript: {
				select: {
					redisKey: true,
				},
			},
		},
	});

	const safeMeeting = z.object({
		name: z.string(),
		transcript: z.object({
			redisKey: z.string(),
		}),
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
// 	const openai = new OpenAIApi(config, undefined);

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

	return (
		<div className="flex flex-col w-full gap-8">
			<Chat meeting={meeting} />
		</div>
	);
};

export default DashboardMeeting;
