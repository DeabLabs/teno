import type { ActionFunction, LoaderFunction } from '@vercel/remix';

import { auth } from '@/server/auth.server';

export const loader: LoaderFunction = ({ request }) => {
	return auth.logout(request, { redirectTo: '/login' });
};

export const action: ActionFunction = ({ request }) => {
	return auth.logout(request, { redirectTo: '/login' });
};
