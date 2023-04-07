import type { PrismaClient } from '@prisma/client';
import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createOrGetUser } from './user.js';

/**
 * Given an interaction, find the most recent meeting that the user is attending and is marked active
 * Since a user can only be in one meeting at a time, this will return the current meeting of the user
 * if any.
 *
 * @param interaction
 * @param prismaClient
 * @returns The meeting if found, null otherwise
 */
export const getActiveMeetingFromInteraction = async (interaction: CommandInteraction, prismaClient: PrismaClient) => {
	try {
		// Bail out if we don't have the required data
		invariant(interaction.guildId, 'No guildId found on interaction');
		invariant(interaction.member, 'No member found on interaction');

		// Get the member from the interaction and make sure it's a GuildMember
		const member = interaction.member;
		invariant(member instanceof GuildMember, 'Member is not a GuildMember');

		// Get the user from the database
		const user = await createOrGetUser(prismaClient, { discordId: member.id });
		invariant(user, 'User could not be created');

		// Find the most recent meeting that the user is attending and is marked active
		// Since a user can only be in one meeting at a time, this will return the most recent active meeting
		const meeting = await prismaClient.meeting.findFirst({
			where: {
				guildId: interaction.guildId,
				attendees: {
					some: {
						id: user.id,
					},
				},
				active: true,
			},
			orderBy: {
				createdAt: 'desc',
			},
		});

		return meeting;
	} catch (error) {
		console.log(error);
		return null;
	}
};
