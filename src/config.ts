import { config } from 'dotenv';
config();

/** Typed union of env var keys defined in envKeys */
type ENV_KEYS = (typeof envKeys)[number];
const envKeys = ['TOKEN', 'DEEPGRAM', 'OPENAI_API_KEY'] as const;

/**
 * A map of environment variables.
 *
 * @example
 * Config.get('TOKEN'); // => 'discordtoken1234567890'
 * Config.get('DEEPGRAM'); // => 'deepgramtoken1234567890'
 */
export const Config = new Map<ENV_KEYS, string>();

// Populate the Config map with the environment variables
envKeys.forEach((key) => {
	const value = process.env[key];
	if (!value) throw new Error(`Missing ${key} in .env file`);
	Config.set(key, value);
});
