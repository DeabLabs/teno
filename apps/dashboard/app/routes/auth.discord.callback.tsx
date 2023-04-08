import type { LoaderFunction } from '@remix-run/node';

import { checkAuth } from '@/server/auth.utils.server';

export let loader: LoaderFunction = ({ request }) => {
	return checkAuth(request, { successRedirect: '/dashboard' });
};
