import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';
import { useAuthoredMeetingCount } from '@/queries/meeting';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	return json({
		user,
	});
};

const Dashboard = () => {
	const { user } = useLoaderData<typeof loader>();
	const { data, isLoading, isError } = useAuthoredMeetingCount({
		userId: user.id,
	});

	return (
		<div className="p-4 flex flex-col gap-4">
			<pre>User {JSON.stringify(user, null, 2)}</pre>
			{data ? (
				<pre>Meetings Authored {JSON.stringify(data, null, 2)}</pre>
			) : isLoading ? (
				<pre>Loading...</pre>
			) : isError ? (
				<pre>Error</pre>
			) : null}
			<Form action="/logout" method="POST">
				<Button variant="subtle" className="my-2" type="submit">
					Logout
				</Button>
			</Form>
		</div>
	);
};

export default Dashboard;
