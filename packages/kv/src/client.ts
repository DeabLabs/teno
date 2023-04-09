import { Redis, RedisOptions } from 'ioredis';

declare global {
	var redis: Redis | undefined;
}

export const createRedisClient = (host: string, options: RedisOptions) => {
	if (global.redis) return global.redis;

	const c = new Redis(host, options);

	if (process.env.NODE_ENV !== 'production') global.redis = c;

	return c;
};

export type RedisClientType = ReturnType<typeof createRedisClient>;
