import type { RedisClientType } from '../index.js';

export const setTranscript = async (client: RedisClientType, args: { transcriptKey: string; transcript: string }) => {
	const result = await client.set(args.transcriptKey, args.transcript);

	if (!result) throw new Error('Could not set transcript');
};

export const appendTranscript = async (
	client: RedisClientType,
	args: { transcriptKey: string; timestamp: number; utterance: string },
) => {
	const { transcriptKey, timestamp, utterance } = args;
	const result = client.zadd(transcriptKey, timestamp, utterance);

	if (!result) throw new Error('Could not append transcript');
};

export const getTranscriptArray = async (client: RedisClientType, args: { transcriptKey: string }) => {
	const result = await client.zrange(args.transcriptKey, 0, -1);

	if (!result) throw new Error('Could not get transcript array');

	return result;
};

/**
 * Delete a transcript from redis
 *
 * @param client - The redis client
 * @param args - The arguments to the query
 */
export const deleteTranscript = async (client: RedisClientType, args: { transcriptKey: string }) => {
	const result = await client.del(args.transcriptKey);

	if (!result) throw new Error('Could not delete transcript');
};

export const batchDeleteTranscripts = async (client: RedisClientType, args: { transcriptKeys: string[] }) => {
	await client.del(args.transcriptKeys);

	return true;
};
