import type { CommandInteraction } from 'discord.js';
import { ChannelType } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import invariant from 'tiny-invariant';
import { userQueries } from 'database';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const autojoinOnCommand = createCommand({
	commandArgs: {
		name: 'autojoin-on',
		description: 'Add a voice channel to the list of channels that Teno will automatically join',
		options: [
			{
				name: 'voice-channel',
				description: 'The voice channel to add to the list of autojoin channels',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildVoice],
			},
			{
				name: 'status-channel',
				description: 'The text channel to send status updates to',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildText],
			},
		],
	},
	handler: autojoinOn,
});

async function autojoinOn(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const userId = interaction.user.id;
	const voiceChannelId = interaction.options.get('voice-channel')?.channel?.id;
	const textChannelId = interaction.options.get('status-channel')?.channel?.id;
	const guildId = interaction.guildId;

	try {
		invariant(userId);
		invariant(voiceChannelId);
		invariant(textChannelId);
		invariant(guildId);
	} catch (e) {
		console.error('Malformed voiceChannelId', e);
		await interaction.editReply({ content: 'Please select a channel.' });
		return;
	}

	try {
		const guild = await teno.getPrismaClient().guild.findUnique({
			where: {
				guildId: guildId,
			},
		});

		invariant(guild);

		const user = await userQueries.createOrGetUser(teno.getPrismaClient(), { discordId: userId });
		await teno.getPrismaClient().user.update({
			where: { id: user.id },
			data: {
				autoJoinedChannels: {
					create: {
						channelId: voiceChannelId,
						guildId: guildId,
						textChannelId,
					},
				},
			},
		});

		// Send a follow-up message to confirm the channel has been added to autojoinChannels
		await interaction.editReply({ content: `Autojoin has been enabled for the selected channel.` });
	} catch (e) {
		console.log(e);
		await interaction.editReply({ content: `Could not configure auto-join for channel.` });
	}
}
