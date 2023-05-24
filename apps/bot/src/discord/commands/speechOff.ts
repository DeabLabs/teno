import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const speechOffCommand = createCommand({
	commandArgs: {
		name: 'speech-off',
		description: `Disable Teno from responding to the conversation with text-to-speech.`,
	},
	handler: speechOff,
});

async function speechOff(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	// Try to lookup the member's current meeting based on their voice channel, if they have one
	const guildId = interaction.guildId;
	const member = interaction.member;
	const memberInVoiceChannel = member instanceof GuildMember && member.voice.channel;
	const voiceChannelId = memberInVoiceChannel && member.voice.channelId;

	let activeMeeting;

	try {
		invariant(member);
		invariant(typeof guildId === 'string');
		invariant(memberInVoiceChannel);
		invariant(typeof voiceChannelId === 'string');
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
		if (activeMeeting) {
			teno.getRelayClient().setSpeakingMode('NeverSpeak');
		}
		teno.disableSpeech();
		await interaction.editReply({
			content: `Teno will no longer respond with text-to-speech.`,
			components: [],
		});
	} catch (e) {
		await interaction.editReply({
			content: `Error turning off text-to-speech.`,
			components: [],
		});
		return;
	}
}
