import type { ActionArgs } from '@vercel/remix';
import { z } from 'zod';

import { redis, transcriptQueries } from '@/server/kv.server';
import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';

export const action = async ({ request, params }: ActionArgs) => {
	const form = await request.formData();

	// when the user clicks the download button, we need to fetch the transcript
	// transform it to a text file and send it back to the user
	// we can use the redis key to fetch the transcript
	const user = await checkAuth(request);
	const { action } = z
		.object({
			action: z.string(),
		})
		.parse(Object.fromEntries(form.entries()));

	console.log({ action });

	// check if the action query is download
	if (action === 'download') {
		// fetch the meeting
		const meeting = await prisma.meeting.findFirst({
			where: {
				id: z.coerce.number().parse(params.id),
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

		if (!meeting || !meeting.transcript) {
			return new Response('Meeting Not found', {
				status: 404,
			});
		}

		const key = meeting.transcript.redisKey;
		const transcript = await transcriptQueries.getTranscriptArray(redis, { transcriptKey: key });
		// clean transcript by removing all blocks of text surrounded by <>
		const cleanedTranscript = transcript.map((t) => t.replaceAll(/<\d+>/g, '').replaceAll('\n', '')).join('\n');

		// transform the transcript to a text file
		// and send the text file back to the user
		return new Response(cleanedTranscript, {
			headers: {
				'Content-Type': 'text/plain',
				'Content-Disposition': `attachment; filename=meeting-${meeting.name}-transcript.txt`,
			},
			status: 200,
		});
	}

	// return a not found response
	return new Response('Not Found', {
		status: 404,
	});
};
