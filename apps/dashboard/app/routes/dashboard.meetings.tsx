import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useEffect, useRef, useState } from 'react';
import { useActionData, useLoaderData, useSubmit } from '@remix-run/react';
import clsx from 'clsx';

import { meetingQueries, prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	return json({
		authoredMeetings: await meetingQueries.findAllAuthoredMeetings(prisma, { userId: user.id }),
	});
};

export const action = async ({ request }: LoaderArgs) => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const user = await checkAuth(request);
	// log out form data from the request
	try {
		if (request.method === 'DELETE') {
			const formData = await request.formData();
			const IDsToDelete = formData
				.get('selectedMeeting')
				?.toString()
				?.split('|')
				.map((id) => Number(id))
				.filter((id) => !isNaN(id));

			if (IDsToDelete) {
				// TODO call deleteAuthoredMeetingsById with a redisClient deletion function
			}
		}
	} catch (e) {
		console.error(e);
	}

	return json({ message: 'success' }, { status: 200 });
};

const DashboardMeetings = () => {
	const submit = useSubmit();
	const { authoredMeetings } = useLoaderData<typeof loader>();
	const data = useActionData();

	type Meeting = (typeof authoredMeetings)[number];

	const checkbox = useRef<HTMLInputElement>(null);
	const [checked, setChecked] = useState(false);
	const [indeterminate, setIndeterminate] = useState(false);
	const [selectedMeeting, setSelectedMeeting] = useState<Meeting[]>([]);

	const handleSubmit = () => {
		const form = new FormData();
		form.append('selectedMeeting', selectedMeeting.map((meeting) => meeting.id).join('|'));
		return submit(form, { method: 'DELETE' });
	};

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

	return (
		<div className="w-full mb-4 rounded">
			<div className="mt-6 flow-root">
				<div className="overflow-x-auto">
					<div className="inline-block min-w-full align-middle bg-white rounded">
						<div className="relative">
							{selectedMeeting.length > 0 && (
								<div className="absolute left-14 top-0 flex h-12 items-center space-x-3 bg-white sm:left-12">
									<button
										name="_action"
										value="delete"
										type="button"
										className="inline-flex items-center rounded bg-white px-2 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
										onClick={handleSubmit}
									>
										Delete Selected
									</button>
								</div>
							)}
							<table className="min-w-full table-fixed divide-y divide-gray-300">
								<thead>
									<tr>
										<th scope="col" className="relative px-7 sm:w-12 sm:px-6">
											<input
												type="checkbox"
												className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
												ref={checkbox}
												checked={checked}
												onChange={toggleAll}
											/>
										</th>
										<th scope="col" className="min-w-[12rem] py-3.5 pr-3 text-left text-sm font-semibold text-gray-900">
											Name
										</th>
										<th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
											Created At
										</th>
										<th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
											Locked
										</th>
										<th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
											Active
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200 bg-white">
									{authoredMeetings.map((meeting) => (
										<tr key={meeting.id} className={selectedMeeting.includes(meeting) ? 'bg-gray-50' : undefined}>
											<td className="relative px-7 sm:w-12 sm:px-6">
												{selectedMeeting.includes(meeting) && (
													<div className="absolute inset-y-0 left-0 w-1 bg-gray-600" />
												)}
												<input
													type="checkbox"
													className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
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
													selectedMeeting.includes(meeting) ? 'text-indigo-600' : 'text-gray-900',
												)}
											>
												{meeting.name}
											</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{meeting.createdAt}</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{String(meeting.locked)}</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{String(meeting.active)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default DashboardMeetings;
