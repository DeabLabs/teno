import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';
import type { PrismaClientType } from 'database';
import { createOrGetUser } from 'database';
import { findActiveMeeting } from 'database';

/**
 * Given an interaction, find the most recent meeting that the user is attending and is marked active
 * Since a user can only be in one meeting at a time, this will return the current meeting of the user
 * if any.
 *
 * @param interaction
 * @param prismaClient
 * @returns The meeting if found, null otherwise
 */
export const getActiveMeetingFromInteraction = async (
	interaction: CommandInteraction,
	prismaClient: PrismaClientType,
) => {
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
		const meeting = await findActiveMeeting(prismaClient, { userId: user.id, guildId: interaction.guildId });

		return meeting;
	} catch (error) {
		console.log(error);
		return null;
	}
};
