import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FormMethod } from '@remix-run/react';
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { meetingQueries, prisma } from '@/server/database.server';
import { redis, transcriptQueries } from '@/server/kv.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';
import WarningDialog from '@/components/WarningDialog';

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
	const formRef = useRef<HTMLFormElement>(null);
	const { authoredMeetings } = useLoaderData<typeof loader>();
	const submit = useSubmit();
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

	/**
	 * Handle submit events from button elements of type submit
	 *
	 * Merge the incoming button event name and value with the form data
	 */
	function handleSubmit(e: FormEvent<HTMLButtonElement>) {
		e.preventDefault();
		if (formRef.current) {
			const fd = new FormData(formRef.current);
			fd.append(e.currentTarget.name, e.currentTarget.value);
			submit(fd, {
				method: formRef.current.method as FormMethod,
				replace: true,
			});
		}
	}

	const mainBg = 'bg-gray-900';
	const mainText = 'text-gray-100';
	const secondaryText = 'text-white';
	const stickyHeader = 'sticky top-16 z-10 bg-gray-900 backdrop-blur backdrop-filter bg-opacity-75';

	return (
		<div className="flex flex-col w-full gap-8">
			<div className="sm:px-4 mt-8">
				<div className="sm:flex sm:items-center">
					<div className="sm:flex-auto">
						<h1 className="text-base font-semibold leading-6 text-white">Authored Meetings</h1>
						<p className="mt-2 text-sm text-gray-300">
							A list of all the meetings that you have authored, across all of your guilds.
						</p>
						<p className="text-sm text-red-300">
							Deleting a meeting here will delete it for all attendees. <b>You cannot undo this action.</b>
						</p>
					</div>
				</div>
			</div>
			<Form className="w-full mb-4 rounded" method="post" replace ref={formRef}>
				<fieldset className={clsx('flow-root')} disabled={loading}>
					<div className="">
						<div className={clsx('inline-block min-w-full align-middle rounded', mainBg)}>
							<div className="relative">
								<table className="min-w-full table-fixed divide-y divide-gray-800">
									<thead>
										<tr className={clsx(mainText)}>
											<th scope="col" className={clsx(stickyHeader, 'relative px-7 sm:w-12 sm:px-6')}>
												<input
													type="checkbox"
													className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
													ref={checkbox}
													checked={checked}
													onChange={toggleAll}
												/>
											</th>
											<th
												scope="col"
												className={clsx(stickyHeader, 'min-w-[12rem] pr-3 text-left text-sm font-semibold')}
											>
												<div className="flex h-full w-full items-center gap-5">
													Name
													{(selectedMeeting.length > 0 || loading) && (
														<div className={clsx('flex h-full items-center', mainBg)}>
															<WarningDialog
																content={`This action cannot be undone. This will permanently delete ${
																	selectedMeeting.length
																} meeting${selectedMeeting.length > 1 ? 's' : ''}.`}
																buttonProps={{
																	name: '_action',
																	value: 'delete',
																}}
																onConfirm={handleSubmit}
															>
																<Button type="button" variant={'destructive'} size={'sm'} className="h-8">
																	Delete {selectedMeeting.length} Meeting{selectedMeeting.length > 1 ? 's' : ''}
																</Button>
															</WarningDialog>
															{loading && <Loader2 className="animate-spin" />}
														</div>
													)}
												</div>
											</th>
											<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')}>
												Created At
											</th>
											<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')}>
												Locked
											</th>
											<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')}>
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
		</div>
	);
};

export default DashboardMeetings;
