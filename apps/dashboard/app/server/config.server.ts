import dotenv from 'dotenv';
import { parseEnv, z } from 'znv';
dotenv.config();

/** Typed union of env var keys defined in envKeys */
type ENV_KEYS = (typeof envKeys)[number];
const envKeys = [
	'DATABASE_URL',
	'DASHBOARD_URL',
	'DASHBOARD_PORT',
	'DASHBOARD_PROTOCOL',
	'DASHBOARD_HOST',
	'DASHBOARD_SECRET',
	'DISCORD_CLIENT_ID',
	'DISCORD_CLIENT_SECRET',
	'REDIS_URL',
] as const;

// Create a zod schema from the envKeys array
// Every key is required
const envKeyObject = envKeys.reduce((acc, curr) => {
	acc[curr] = z.string().min(1, `Missing ${curr} in .env file`);
	return acc;
}, {} as Record<ENV_KEYS, z.ZodString>);

/**
 * An object of environment variables.
 *
 * @example
 * Config.TOKEN; // => 'discordtoken1234567890'
 */
export const Config = parseEnv(process.env, envKeyObject);
