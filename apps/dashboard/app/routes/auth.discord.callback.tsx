import type { LoaderFunction } from '@vercel/remix';

import { checkAuth } from '@/server/auth.utils.server';

export let loader: LoaderFunction = ({ request }) => {
	return checkAuth(request, { successRedirect: '/dashboard' });
};
