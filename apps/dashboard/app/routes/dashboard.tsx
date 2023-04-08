import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';
import { prisma, meetingQueries } from '@/server/database.server';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);
	const authoredMeetingCount = await meetingQueries.countAllAuthoredMeetings(prisma, { userId: user.id });

	return json({
		user,
		authoredMeetingCount,
	});
};

const Dashboard = () => {
	const { user, authoredMeetingCount } = useLoaderData<typeof loader>();

	return (
		<div className="p-4 flex flex-col gap-4">
			<pre>User: {JSON.stringify(user, null, 2)}</pre>
			<pre>Meetings Authored: {JSON.stringify(authoredMeetingCount, null, 2)}</pre>
			<Form action="/logout" method="POST">
				<Button variant="subtle" className="my-2" type="submit">
					Logout
				</Button>
			</Form>
		</div>
	);
};

export default Dashboard;
