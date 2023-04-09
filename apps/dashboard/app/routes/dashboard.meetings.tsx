import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useEffect, useRef, useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { meetingQueries, prisma } from '@/server/database.server';
import { redis, transcriptQueries } from '@/server/kv.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';

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
				// TODO call deleteAuthoredMeetingsById with a redisClient deletion function
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
	const data = useActionData();
	const { state } = useNavigation();
	const loading = state === 'submitting';

	type Meeting = (typeof authoredMeetings)[number];

	const checkbox = useRef<HTMLInputElement>(null);
	const [checked, setChecked] = useState(false);
	const [indeterminate, setIndeterminate] = useState(false);
	const [selectedMeeting, setSelectedMeeting] = useState<Meeting[]>([]);

	useEffect(() => {
		const isIndeterminate = selectedMeeting.length > 0 && selectedMeeting.length < authoredMeetings.length;
		setChecked(selectedMeeting.length === authoredMeetings.length);
		setIndeterminate(isIndeterminate);
		if (checkbox.current) {
			checkbox.current.indeterminate = isIndeterminate;
		}
	}, [selectedMeeting, authoredMeetings.length]);

	useEffect(() => {
		setChecked(false);
		setSelectedMeeting([]);
		setIndeterminate(false);
	}, [data]);

	function toggleAll() {
		setSelectedMeeting(checked || indeterminate ? [] : (authoredMeetings as Meeting[]));
		setChecked(!checked && !indeterminate);
		setIndeterminate(false);
	}

	const mainBg = 'bg-gray-900';
	const mainText = 'text-gray-100';
	const secondaryText = 'text-white';

	return (
		<Form className="w-full mb-4 rounded" method="post" replace>
			<fieldset className={clsx('flow-root mt-6')} disabled={loading}>
				<div className="overflow-x-auto">
					<div className={clsx('inline-block min-w-full align-middle rounded', mainBg)}>
						<div className="relative">
							{(selectedMeeting.length > 0 || loading) && (
								<div className={clsx('absolute left-14 top-0 flex h-12 items-center space-x-3 sm:left-12', mainBg)}>
									<Button name="_action" value="delete" type="submit" variant={'destructive'} size={'sm'}>
										Delete Selected
									</Button>
									{loading && <Loader2 className="animate-spin" />}
								</div>
							)}
							<table className="min-w-full table-fixed divide-y divide-gray-800">
								<thead>
									<tr className={clsx(mainText)}>
										<th scope="col" className="relative px-7 sm:w-12 sm:px-6">
											<input
												type="checkbox"
												className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
												ref={checkbox}
												checked={checked}
												onChange={toggleAll}
											/>
										</th>
										<th scope="col" className={'min-w-[12rem] py-3.5 pr-3 text-left text-sm font-semibold'}>
											Name
										</th>
										<th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">
											Created At
										</th>
										<th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">
											Locked
										</th>
										<th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">
											Active
										</th>
									</tr>
								</thead>
								<tbody className={clsx('divide-y divide-gray-800', mainBg)}>
									{authoredMeetings.map((meeting) => (
										<tr
											key={meeting.id}
											className={clsx(selectedMeeting.includes(meeting) && 'bg-gray-800', secondaryText)}
										>
											<td className="relative px-7 sm:w-12 sm:px-6">
												{selectedMeeting.includes(meeting) && (
													<div className="absolute inset-y-0 left-0 w-1 bg-gray-600" />
												)}
												<input
													type="checkbox"
													className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
													name="selectedMeeting"
													value={meeting.id}
													checked={selectedMeeting.includes(meeting)}
													onChange={(e) =>
														setSelectedMeeting(
															e.target.checked
																? [...selectedMeeting, meeting]
																: selectedMeeting.filter((p) => p !== meeting),
														)
													}
												/>
											</td>
											<td
												className={clsx(
													'whitespace-nowrap py-4 pr-3 text-sm font-medium',
													selectedMeeting.includes(meeting) ? 'text-indigo-200' : secondaryText,
												)}
											>
												{meeting.name}
											</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">{meeting.createdAt}</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">{String(meeting.locked)}</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">{String(meeting.active)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</fieldset>
		</Form>
	);
};

export default DashboardMeetings;
