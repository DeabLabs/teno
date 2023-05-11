import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import type { RelayResponderConfig } from '@/services/relay.js';
import { configResponder } from '@/services/relay.js';

export const speechOnCommand = createCommand({
	commandArgs: {
		name: 'speech-on',
		description: `Enable Teno to respond to the conversation with text-to-speech.`,
	},
	handler: speechOn,
});

async function speechOn(interaction: CommandInteraction, teno: Teno) {
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
			const config: RelayResponderConfig = {
				SpeakingMode: 3, // AutoSleep
			};
			configResponder(guildId, config);
			await interaction.editReply({
				content: `Teno can now respond with text-to-speech.`,
				components: [],
			});
		}
		teno.enableSpeech();
	} catch (e) {
		await interaction.editReply({
			content: `Error turning on text-to-speech.`,
			components: [],
		});
		return;
	}
}
