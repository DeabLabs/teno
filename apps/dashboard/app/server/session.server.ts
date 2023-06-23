import { createCookieSessionStorage } from '@vercel/remix';

import { Config } from './config.server';

export const sessionStorage = createCookieSessionStorage({
	cookie: {
		name: '_session',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: [Config.DASHBOARD_SECRET],
		secure: process.env.NODE_ENV === 'production',
	},
});

export const { getSession, commitSession, destroySession } = sessionStorage;
