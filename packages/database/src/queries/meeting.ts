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
