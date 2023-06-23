import type { ActionFunction, LoaderFunction } from '@vercel/remix';
import { redirect } from '@vercel/remix';

import { auth } from '@/server/auth.server';

export let loader: LoaderFunction = () => redirect('/login');

export let action: ActionFunction = ({ request }) => {
	return auth.authenticate('discord', request);
};
