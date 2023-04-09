import { createRedisClient } from 'kv';

import { Config } from './config.server';
export * from 'kv';

export const redis = createRedisClient(Config.REDIS_URL, {});
