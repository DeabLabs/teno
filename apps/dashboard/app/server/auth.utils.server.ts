import type { AuthenticateOptions } from 'remix-auth';

import type { DiscordUser } from './auth.server';
import { auth } from './auth.server';

type CheckAuthOptions = Pick<AuthenticateOptions, 'successRedirect' | 'failureRedirect' | 'throwOnError' | 'context'>;

const FAILURE_REDIRECT = '/login';

export const checkAuth = (
	request: Request,
	{ successRedirect, failureRedirect = FAILURE_REDIRECT }: Partial<CheckAuthOptions> = {
		failureRedirect: '/login',
	},
) =>
	auth.authenticate('discord', request, {
		successRedirect,
		failureRedirect,
	}) as Promise<DiscordUser>;
