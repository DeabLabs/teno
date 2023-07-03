import type { LoaderArgs } from '@vercel/remix';
import { json } from '@vercel/remix';
import { Outlet, useLoaderData } from '@remix-run/react';
import { z } from 'zod';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Chat } from '@/components/chat';

/**
 * - Link to individual meeting ✅
 * - individual meeting page ✅
 * - style the page ✅
 * - conversation action so people can talk with transcript ✅
 * - fetch transcript for download (stretch goal) ✅
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
		id: z.number(),
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

const DashboardMeeting = () => {
	const { meeting } = useLoaderData<typeof loader>();

	return (
		<div className="flex flex-col w-full gap-8">
			{/* three columns, the middle column takes more width than the outer two */}
			<div className="grid grid-cols-[1fr_minmax(0,_2fr)_1fr]">
				<Outlet />
				<Chat meeting={meeting} />
				<div></div>
			</div>
		</div>
	);
};

export default DashboardMeeting;
