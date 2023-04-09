import invariant from 'tiny-invariant';
import { PrismaClientType } from '../client.js';

/**
 * Find the most recent meeting that the user is attending and is marked active
 * Since a user can only be in one meeting at a time, this will return the active meeting, ignoring
 * active meetings that were not correctly ended.
 *
 * @param client - The prisma client
 * @param args - The arguments to the query
 * @returns - The meeting if found, null otherwise
 */
export const findActiveMeeting = async (client: PrismaClientType, args: { userId: number; guildId: string }) => {
	return client.meeting.findFirst({
		where: {
			guildId: args.guildId,
			attendees: {
				some: {
					id: args.userId,
				},
			},
			active: true,
		},
		orderBy: {
			createdAt: 'desc',
		},
	});
};

export const countAllAuthoredMeetings = async (client: PrismaClientType, args: { userId: number }) => {
	return client.meeting.count({
		where: {
			authorId: args.userId,
		},
	});
};

export const countAllAttendedMeetings = async (client: PrismaClientType, args: { userId: number }) => {
	return client.meeting.count({
		where: {
			attendees: {
				some: {
					id: args.userId,
				},
			},
		},
	});
};

export const countAllServersWithMeetings = async (client: PrismaClientType, args: { userId: number }) => {
	return client.meeting
		.groupBy({
			where: {
				attendees: {
					some: {
						id: args.userId,
					},
				},
			},
			by: ['guildId'],
		})
		.then((r) => r.length);
};

export const findAllAuthoredMeetings = async (client: PrismaClientType, args: { userId: number }) => {
	return client.meeting.findMany({
		where: {
			authorId: args.userId,
		},
		orderBy: {
			createdAt: 'desc',
		},
	});
};

export const deleteAuthoredMeetingsById = async (
	client: PrismaClientType,
	deleteTranscriptRedisKeys: (redisKeys: string[]) => Promise<boolean>,
	args: { userId: number; meetingIds: number[] },
) => {
	const [authoredMeetingIds, authoredTranscriptIds, transcriptRedisKeys] = (
		await client.meeting.findMany({
			where: {
				authorId: args.userId,
				id: {
					in: args.meetingIds,
				},
			},
			select: {
				id: true,
				transcript: {
					select: {
						id: true,
						redisKey: true,
					},
				},
			},
		})
	).reduce(
		(acc, curr) => {
			if (curr.transcript) {
				acc[1].push(curr.transcript.id);
				if (curr.transcript?.redisKey) {
					acc[2].push(curr.transcript.redisKey);
				}
			}
			acc[0].push(curr.id);
			return acc;
		},
		[[], [], []] as Readonly<[number[], number[], string[]]>,
	);

	invariant(authoredMeetingIds.length > 0, 'Length of authored meeting ids is 0');
	invariant(
		transcriptRedisKeys.length === authoredTranscriptIds.length,
		'Redis keys and transcript ids do not match length',
	);

	console.log({
		authoredMeetingIds,
		authoredTranscriptIds,
		transcriptRedisKeys,
	});

	try {
		if (transcriptRedisKeys.length > 0) {
			const success = await deleteTranscriptRedisKeys(transcriptRedisKeys);

			if (!success) {
				throw new Error('Failed to delete transcript redis keys');
			}
		}
	} catch (e) {
		console.error(e);
		throw e;
	}

	const deleteTranscripts = () =>
		client.transcript.deleteMany({
			where: {
				id: {
					in: authoredTranscriptIds,
				},
			},
		});

	const deleteMeetings = () =>
		client.user.update({
			where: {
				id: args.userId,
			},
			data: {
				authoredMeetings: {
					deleteMany: {
						id: {
							in: authoredMeetingIds,
						},
					},
				},
			},
		});

	return client.$transaction([deleteTranscripts(), deleteMeetings()]);
};
