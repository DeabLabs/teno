import { json } from '@remix-run/node';
import type { LoaderFunction } from '@remix-run/node';

import { countAllAuthoredMeetings, prisma } from '@/server/database.server';

export const loader: LoaderFunction = async ({ request, params }) => {
	const { userId } = params;

	try {
		const count = await countAllAuthoredMeetings(prisma, { userId: Number(userId) });

		return json({ count });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 400 });
	}
};
