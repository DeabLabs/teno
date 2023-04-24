import dotenv from 'dotenv';
import { parseEnv, z } from 'znv';
dotenv.config();

/** Typed union of env var keys defined in envKeys */
type ENV_KEYS = (typeof envKeys)[number];
const envKeys = ['TOKEN', 'DEEPGRAM', 'OPENAI_API_KEY', 'REDIS_URL', 'DATABASE_URL', 'AZURE_SPEECH_REGION'] as const;

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
 * Config.DEEPGRAM; // => 'deepgramtoken1234567890'
 */
export const Config = parseEnv(process.env, envKeyObject);
