import { commandQueries } from 'kv';

import type { RedisClient } from '@/bot.js';

type CommandCacheOptions = {
	redisClient: RedisClient;
	userDiscordId: string;
	guildId: string;
	commandName: string;
	customCacheKeyGenerator?: (args: CacheKeyGeneratorArgs) => string;
};

type CacheKeyGeneratorArgs = {
	userDiscordId: string;
	guildId: string;
	commandName: string;
};

const CACHE_KEY_PREFIX = 'command-cache:';

const makeCacheKey = ({ userDiscordId, guildId, commandName }: CacheKeyGeneratorArgs) =>
	`${userDiscordId}:${guildId}:${commandName}`;

/**
 * When instantiated with a discord user id, a guild id, and a command name, this class will
 * provide a way to cache data for a given user and command
 *
 * This is helpful for commands that require multiple steps to complete and may need data from
 * the previous step
 *
 * Cached values will expire after 5 minutes by default
 */
export class CommandCache {
	private redisClient: RedisClient;
	private key: string;
	private expiration: number;

	constructor({ redisClient, userDiscordId, guildId, commandName, customCacheKeyGenerator }: CommandCacheOptions) {
		this.redisClient = redisClient;
		this.key = `${CACHE_KEY_PREFIX}${(customCacheKeyGenerator ?? makeCacheKey)({
			userDiscordId,
			guildId,
			commandName,
		})}`;
		this.expiration = 5 * 60; // 5 minutes, in seconds
	}

	async getValue() {
		const value = await commandQueries.getCommandValue(this.redisClient, { commandKey: this.key });
		if (!value) return null;
		return String(value);
	}

	async setValue(value: string, customExpirationSeconds?: number) {
		const seconds = customExpirationSeconds ?? this.expiration;
		await commandQueries.setCommandValue(this.redisClient, { commandKey: this.key, seconds, value });
	}
}
