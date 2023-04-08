// app/auth.server.ts
import { Authenticator } from 'remix-auth';
import type { DiscordProfile } from 'remix-auth-discord';
import { DiscordStrategy } from 'remix-auth-discord';

import { sessionStorage } from './session.server';
import { Config } from './config.server';

export interface DiscordUser {
	id: number;
	discordId: DiscordProfile['id'];
	displayName: DiscordProfile['displayName'];
	avatar: DiscordProfile['__json']['avatar'];
	discriminator: DiscordProfile['__json']['discriminator'];
	email: DiscordProfile['__json']['email'];
	accessToken: string;
	refreshToken: string;
}

export const auth = new Authenticator<DiscordUser>(sessionStorage);

const discordStrategy = new DiscordStrategy(
	{
		clientID: Config.DISCORD_CLIENT_ID,
		clientSecret: Config.DISCORD_CLIENT_SECRET,
		callbackURL: `${Config.DASHBOARD_URL}/auth/discord/callback`,
		// Provide all the scopes you want as an array
		scope: ['identify', 'email', 'guilds'],
	},
	async ({ accessToken, refreshToken, profile }): Promise<DiscordUser> => {
		/**
		 * Construct the user profile to your liking by adding data you fetched etc.
		 * and only returning the data that you actually need for your application.
		 */
		return {
			id: -1,
			discordId: profile.id,
			displayName: profile.__json.username,
			avatar: profile.__json.avatar,
			discriminator: profile.__json.discriminator,
			email: profile.__json.email,
			accessToken,
			refreshToken,
		};
	},
);

auth.use(discordStrategy);
