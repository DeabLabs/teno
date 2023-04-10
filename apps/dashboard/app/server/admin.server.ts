import type { PrismaClientType } from './database.server';
import type { RedisClientType } from './kv.server';
import { transcriptQueries } from './kv.server';

/**
 * Using prisma and kv (redis), update all meetings that have a duration of 0 to the timestamp of the last transcript line
 * from the transcript of the meeting, stored in redis.
 */
export const addDefaultMeetingDuration = async (userId: number, prisma: PrismaClientType, kv: RedisClientType) => {
	const promises: Promise<any>[] = [];
	const user = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			admin: true,
		},
	});

	if (!user?.admin) return;

	const meetings = await prisma.meeting.findMany({
		where: {
			duration: 0,
		},
		include: {
			transcript: true,
		},
	});

	for (const meeting of meetings) {
		if (!meeting.transcript?.redisKey) continue;
		const transcript = await transcriptQueries.getTranscriptTimestampArray(kv, {
			transcriptKey: meeting.transcript.redisKey,
		});
		if (!transcript) continue;

		const lastLine = transcript[transcript.length - 1];
		if (!lastLine) continue;

		// the last line is the score aka the timestamp, it is a string so we need to convert it to a number
		// the meeting duration then is the timestamp of the last line minus the meeting created at timestamp
		const duration = Number(lastLine) - meeting.createdAt.getTime();
		if (isNaN(duration)) continue;

		promises.push(
			prisma.meeting.update({
				where: {
					id: meeting.id,
				},
				data: {
					duration,
				},
			}),
		);
	}

	return await Promise.all(promises);
};
