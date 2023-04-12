import type { CommandInteraction, MessageActionRowComponentBuilder } from 'discord.js';
import { ChannelType } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import { VoiceChannel } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const autojoinOnCommand = createCommand({
	commandArgs: {
		name: 'autojoin-on',
		description: 'Add a voice channel to the list of channels that Teno will automatically join',
		options: [
			{
				name: 'channel',
				description: 'The voice channel to add to the list of autojoin channels',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildVoice],
			},
		],
	},
	handler: autojoinOn,
});

async function autojoinOn(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const channelId = interaction.options.get('channel')?.channel?.id;
	const guildId = interaction.guildId;

	try {
		invariant(channelId);
		invariant(guildId);
	} catch (e) {
		console.error('Malformed channelId', e);
		await interaction.followUp({ content: 'Please select a channel.', ephemeral: true });
		return;
	}

	// Get the current guild record from the database
	const guild = await teno.getPrismaClient().guild.findUnique({
		where: { id: guildId },
	});

	// Update the autojoinChannels array if the channelId is not already present
	if (guild && !guild.autojoinChannels.includes(channelId)) {
		await teno.getPrismaClient().guild.update({
			where: { id: guildId },
			data: {
				autojoinChannels: {
					push: channelId,
				},
			},
		});
	}

	// Send a follow-up message to confirm the channel has been added to autojoinChannels
	await interaction.followUp({ content: `Autojoin has been enabled for the selected channel.`, ephemeral: true });
}
