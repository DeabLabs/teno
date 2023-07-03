import type { LoaderArgs } from '@vercel/remix';
import { Await, useLoaderData } from '@remix-run/react';
import Balancer from 'react-wrap-balancer';
import { Suspense } from 'react';

import { cn } from '@/lib/utils';
import { generateSummaries } from '@/server/meeting.id.summary.server';

export const loader = async (args: LoaderArgs) => {
	return generateSummaries(args);
};

const DashboardMeetingSummary = () => {
	const { summary, attendees, actionItems } = useLoaderData<typeof loader>();

	return (
		<div className={cn('pb-[200px] pt-4 md:pt-10 max-h-[calc(100vh-65px)] overflow-y-auto ')}>
			<div className="mx-auto max-w-2xl px-4 flex flex-col gap-4">
				<div className="rounded-lg border bg-background p-8 min-h-[280px]">
					<h1 className="mb-2 text-lg font-semibold">Meeting Summary</h1>
					<div className="mt-4 flex flex-col items-start space-y-2">
						<Suspense fallback={<p>Loading...</p>}>
							<Await resolve={summary} errorElement={<p>Could not generate summary from this meeting...</p>}>
								{(summary) => <Balancer className="whitespace-pre-wrap">{summary}</Balancer>}
							</Await>
						</Suspense>
					</div>
				</div>
				<div className="rounded-lg border bg-background p-8 min-h-[280px]">
					<h1 className="mb-2 text-lg font-semibold">Action Items</h1>
					<div className="mt-4 flex flex-col items-start space-y-2">
						<Suspense fallback={<p>Loading...</p>}>
							<Await resolve={actionItems} errorElement={<p>Could not List action items for this meeting...</p>}>
								{(actionItems) => <Balancer className="whitespace-pre-wrap">{actionItems}</Balancer>}
							</Await>
						</Suspense>{' '}
					</div>
				</div>
				<div className="rounded-lg border bg-background p-8 min-h-[280px]">
					<h1 className="mb-2 text-lg font-semibold">Meeting Attendees</h1>
					<div className="mt-4 flex flex-col items-start space-y-2">
						<Suspense fallback={<p>Loading...</p>}>
							<Await resolve={attendees} errorElement={<p>Could not List attendees for this meeting...</p>}>
								{(attendees) => <Balancer className="whitespace-pre-wrap">{attendees}</Balancer>}
							</Await>
						</Suspense>{' '}
					</div>
				</div>
			</div>
		</div>
	);
};

export default DashboardMeetingSummary;
