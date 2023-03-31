import type { PrismaClient } from '@prisma/client';

export const createOrGetUser = async (client: PrismaClient, args: { discordId: string }) => {
	const user = await client.user.upsert({
		where: { discordId: args.discordId },
		update: {},
		create: { discordId: args.discordId },
	});
	return user;
};
