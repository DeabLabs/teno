import type { CommandInteraction } from 'discord.js';
import { ChannelType } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const autojoinOffCommand = createCommand({
	commandArgs: {
		name: 'autojoin-off',
		description: 'Remove a voice channel from the list of channels that Teno will automatically join',
		options: [
			{
				name: 'channel',
				description: 'The voice channel to remove from the list of autojoin channels',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildVoice],
			},
		],
	},
	handler: autojoinOff,
});

async function autojoinOff(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const channelId = interaction.options.get('channel')?.channel?.id;
	const guildId = interaction.guildId;
	const userId = interaction.user.id;

	try {
		invariant(userId);
		invariant(channelId);
		invariant(guildId);
	} catch (e) {
		console.error('Malformed channelId', e);
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

		const user = await teno.getPrismaClient().user.findUnique({
			where: {
				discordId: userId,
			},
		});
		invariant(user);
		try {
			await teno.getPrismaClient().user.update({
				where: { discordId: userId },
				data: {
					autoJoinedChannels: {
						delete: {
							guildId_channelId_userId: {
								guildId,
								channelId,
								userId: user.id,
							},
						},
					},
				},
			});
		} catch {
			// keep
		}

		// Send a follow-up message to confirm the channel has been added to autojoinChannels
		await interaction.editReply({ content: `Autojoin has been turned off for the selected channel.` });
	} catch (e) {
		console.log(e);
		await interaction.editReply({ content: `Could not configure auto-join for channel.` });
	}
}
