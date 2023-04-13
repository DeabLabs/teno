import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

// unmuteMe command
export const unmuteMeCommand = createCommand({
	commandArgs: {
		name: 'unmute-me',
		description: `Allow Teno to start listening to you again.`,
	},
	handler: unmuteMe,
});

async function unmuteMe(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	// Try to lookup the member's current meeting based on their voice channel, if they have one
	const guildId = interaction.guildId;
	const member = interaction.member;
	const memberInVoiceChannel = member instanceof GuildMember && member.voice.channel;
	const voiceChannelId = memberInVoiceChannel && member.voice.channelId;

	try {
		invariant(member);
		invariant(typeof guildId === 'string');
		invariant(memberInVoiceChannel);
		invariant(typeof voiceChannelId === 'string');
	} catch (e) {
		await interaction.editReply({
			content: 'You are not currently in a meeting with Teno.',
			components: [],
		});
		return;
	}

	let activeMeeting;

	try {
		activeMeeting = await teno.getPrismaClient().meeting.findFirst({
			where: {
				active: true,
				channelId: voiceChannelId,
				attendees: {
					some: {
						discordId: member.id,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
		});
		invariant(activeMeeting);
	} catch (e) {
		await interaction.editReply({
			content: 'You are not currently in a meeting with Teno.',
			components: [],
		});
		return;
	}

	try {
		invariant(activeMeeting);

		teno.getMeeting(activeMeeting.id)?.stopIgnoring(member.id);

		await interaction.editReply({
			content: `Teno has started listening to you again in the current meeting.`,
		});
	} catch (e) {
		await interaction.editReply({
			content: 'You are not currently in a meeting with Teno.',
		});
	}
}
