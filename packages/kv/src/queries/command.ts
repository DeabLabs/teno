import type { RedisClientType } from '../index.js';

export const getCommandValue = async (client: RedisClientType, args: { commandKey: string }) => {
	const result = await client.get(args.commandKey);

	if (!result) throw new Error('Could not get command value');

	return result;
};

export const setCommandValue = async (
	client: RedisClientType,
	args: { commandKey: string; value: string; seconds: number },
) => {
	const result = await client.setex(args.commandKey, args.seconds, args.value);

	if (!result) throw new Error('Could not set command value');
};
