import type { LoaderFunction } from '@remix-run/node';

import { checkAuth } from '@/server/auth.utils.server';

export const loader: LoaderFunction = ({ request }) => {
	return checkAuth(request, { successRedirect: '/dashboard' });
};
