import type { PrismaClientType } from '../index.js';

/**
 * Get a user by their discord id
 *
 * @param client - The prisma client
 * @param args - The arguments to the query
 *
 * @returns - The user
 */
export const getUser = async (client: PrismaClientType, args: { discordId: string }) => {
	const user = await client.user.findUnique({
		where: { discordId: args.discordId },
	});

	return user;
};

/**
 * Create a new user or get an existing user. This should always be preferred over just creating or
 * getting a user directly from the database.
 *
 * @param client - The prisma client
 * @param args - The arguments to the query
 * @returns - The user
 */
export const createOrGetUser = async (
	client: PrismaClientType,
	args: { discordId: string; name: string; discriminator: string },
) => {
	const userName = `${args.name}#${args.discriminator}`;
	const user = await client.user.upsert({
		where: { discordId: args.discordId },
		update: { name: userName },
		create: { discordId: args.discordId, name: userName },
	});
	return user;
};
