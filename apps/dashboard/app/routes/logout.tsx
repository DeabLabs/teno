import type { ActionFunction } from '@remix-run/node';

import { auth } from '@/server/auth.server';

export const action: ActionFunction = ({ request }) => {
	return auth.logout(request, { redirectTo: '/login' });
};
