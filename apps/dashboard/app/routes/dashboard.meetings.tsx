import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useNavigation, useSubmit } from '@remix-run/react';

import { meetingQueries, prisma } from '@/server/database.server';
import { redis, transcriptQueries } from '@/server/kv.server';
import { checkAuth } from '@/server/auth.utils.server';
import MeetingTable from '@/components/MeetingTable';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	return json({
		authoredMeetings: await meetingQueries.findAllAuthoredMeetings(prisma, { userId: user.id }),
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

const DashboardMeetings = () => {
	const { authoredMeetings } = useLoaderData<typeof loader>();
	const submit = useSubmit();
	const { state } = useNavigation();
	const loading = state === 'submitting';

	return <MeetingTable meetings={authoredMeetings} loading={loading} onSubmit={submit} />;
};

export default DashboardMeetings;
