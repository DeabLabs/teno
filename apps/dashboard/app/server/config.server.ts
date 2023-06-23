import dotenv from 'dotenv';
import { parseEnv, z } from 'znv';
dotenv.config();

// Create a zod schema from the envKeys array
// Every key is required
const envKeyObject = {
	DATABASE_URL: z.string().min(1),
	DASHBOARD_URL: z.string().min(1),
	DASHBOARD_PROTOCOL: z.string().min(1),
	DASHBOARD_SECRET: z.string().min(1),
	DASHBOARD_PORT: z.string().optional(),
	DISCORD_CLIENT_ID: z.string().min(1),
	DISCORD_CLIENT_SECRET: z.string().min(1),
	REDIS_URL: z.string().min(1),
	OPENAI_API_KEY: z.string().min(1),
};
/**
 * An object of environment variables.
 *
 * @example
 * Config.TOKEN; // => 'discordtoken1234567890'
 */
export const Config = parseEnv(process.env, envKeyObject);
