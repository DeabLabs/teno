import type { LoaderArgs } from '@remix-run/node';
import { defer } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Await, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import { Suspense } from 'react';

import { meetingQueries, prisma } from '@/server/database.server';
import { redis, transcriptQueries } from '@/server/kv.server';
import { checkAuth } from '@/server/auth.utils.server';
import MeetingTable from '@/components/MeetingTable';
import { Loader } from '@/components/Loader';
import { Placeholder } from '@/components/Placeholder';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	return defer({
		user,
		attendedMeetings: meetingQueries
			.findAllAttendedMeetings(prisma, { userId: user.id })
			// TODO: this is a hack to get around the fact that prisma doesn't support ISO strings by default
			// and remix is having trouble serializing these the same on the client and server
			.then((m) => m.map((mm) => ({ ...mm, createdAt: mm.createdAt.toISOString() }))),
	});
};

export const action = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	const formData = await request.formData();
	const intent = formData.get('_action')?.toString();

	try {
		if (intent === 'delete') {
			const IDsToDelete = formData
				.getAll('selectedMeeting')
				.map((id) => Number(id))
				.filter((id) => !isNaN(id));

			if (IDsToDelete && IDsToDelete.length > 0) {
				await meetingQueries.deleteAuthoredMeetingsById(
					prisma,
					(transcriptKeys) => transcriptQueries.batchDeleteTranscripts(redis, { transcriptKeys }),
					{ userId: user.id, meetingIds: IDsToDelete },
				);
			}
		}
	} catch (e) {
		console.error(e);
	}

	return json({ message: 'success' }, { status: 200 });
};

const DashboardMeetingsAuthored = () => {
	const { attendedMeetings } = useLoaderData<typeof loader>();
	const submit = useSubmit();
	const { state } = useNavigation();
	const loading = state === 'submitting';

	return (
		<div className="flex flex-col w-full gap-8">
			<div className="sm:px-4">
				<div className="sm:flex sm:items-center">
					<div className="sm:flex-auto">
						<h1 className="text-base font-semibold leading-6 text-white">Attended Meetings</h1>
						<p className="mt-2 text-sm text-gray-300">
							A list of all the meetings that you have attended, but not authored, across all of your guilds.
						</p>
					</div>
				</div>
			</div>
			<Suspense fallback={<Loader />}>
				<Await
					resolve={attendedMeetings}
					errorElement={<Placeholder children={<>Could not load attended meetings...</>} />}
				>
					{(attendedMeetings) => <MeetingTable meetings={attendedMeetings} loading={loading} onSubmit={submit} />}
				</Await>
			</Suspense>
		</div>
	);
};

export default DashboardMeetingsAuthored;
