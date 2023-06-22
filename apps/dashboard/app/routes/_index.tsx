import type { LoaderFunction } from '@vercel/remix';

import { checkAuth } from '@/server/auth.utils.server';

export const loader: LoaderFunction = ({ request }) => {
	return checkAuth(request, { successRedirect: '/dashboard' });
};
