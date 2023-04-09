import type { PrismaClientType } from '../index.js';

/**
 * Create a new user or get an existing user. This should always be preferred over just creating or
 * getting a user directly from the database.
 *
 * @param client - The prisma client
 * @param args - The arguments to the query
 * @returns - The user
 */
export const createOrGetUser = async (client: PrismaClientType, args: { discordId: string }) => {
	const user = await client.user.upsert({
		where: { discordId: args.discordId },
		update: {},
		create: { discordId: args.discordId },
	});
	return user;
};
