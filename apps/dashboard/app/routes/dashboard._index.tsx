import type { LoaderArgs } from '@remix-run/node';
import { defer } from '@remix-run/node';
import { Await, useLoaderData } from '@remix-run/react';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

import { checkAuth } from '@/server/auth.utils.server';
import { prisma, meetingQueries } from '@/server/database.server';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);
	const authoredMeetingCount = meetingQueries.countAllAuthoredMeetings(prisma, { userId: user.id });
	const attendedMeetingCount = meetingQueries.countAllAttendedMeetings(prisma, { userId: user.id });
	const serversWithMeetingCount = meetingQueries.countAllServersWithMeetings(prisma, { userId: user.id });

	return defer({
		user,
		authoredMeetingCount,
		attendedMeetingCount,
		serversWithMeetingCount,
	});
};

const Stat = ({ name, stat }: { name: string; stat: Promise<number> }) => {
	return (
		<div>
			<div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 max-h-fit">
				<dt className="truncate text-sm font-medium text-gray-500">{name}</dt>
				<dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
					<Suspense fallback={<Loader2 className="animate-spin h-9" />}>
						<Await resolve={stat} errorElement={<>Error</>}>
							{(statValue) => statValue}
						</Await>
					</Suspense>
				</dd>
			</div>
		</div>
	);
};

type StatType = {
	name: string;
	stat: Promise<number>;
};

const DashboardIndex = () => {
	const { authoredMeetingCount, attendedMeetingCount, serversWithMeetingCount } = useLoaderData<typeof loader>();
	const stats: StatType[] = [
		{
			name: 'Servers with Meetings',
			stat: serversWithMeetingCount,
		},
		{
			name: 'Meetings Attended',
			stat: attendedMeetingCount,
		},
		{
			name: 'Meetings Authored',
			stat: authoredMeetingCount,
		},
	];
	return (
		<dl className={clsx('mt-5 grid sm:grid-flow-col gap-5 w-full')}>
			{stats.map((item) => (
				<Stat key={item.name} name={item.name} stat={item.stat} />
			))}
		</dl>
	);
};

export default DashboardIndex;
