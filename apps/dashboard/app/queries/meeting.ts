import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const countSchema = z.object({
	count: z.number(),
});
export type AuthoredMeetingCount = z.infer<typeof countSchema>;

export const getAuthoredMeetingCount = (userId: number) =>
	fetch(`/api/meeting/${userId}/authored-count`).then(async (res) => {
		const j = await res.json();

		return countSchema.parse(j);
	});

export const useAuthoredMeetingCount = ({
	userId,
	initialData,
}: {
	userId: number;
	initialData?: AuthoredMeetingCount;
}) => {
	return useQuery<AuthoredMeetingCount>({
		queryKey: ['authoredMeetingCount', userId],
		queryFn: () => getAuthoredMeetingCount(userId),
		initialData,
	});
};
