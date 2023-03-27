import { config } from 'dotenv';
import { parseEnv } from 'znv';
import { z } from 'zod';
config();

/** Typed union of env var keys defined in envKeys */
type ENV_KEYS = (typeof envKeys)[number];
const envKeys = ['TOKEN', 'DEEPGRAM', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY'] as const;

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
