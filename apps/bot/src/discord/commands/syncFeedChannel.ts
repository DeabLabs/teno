import type { CommandInteraction, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const syncFeedChannelCommand = createCommand({
	commandArgs: {
		name: 'sync-feed-channel',
		description: 'Sync a text channel with the voice bot as a feed channel',
		options: [
			{
				name: 'text-channel',
				description: 'The text channel to sync',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildText],
			},
		],
	},
	handler: syncFeedChannelHandler,
});

async function syncFeedChannelHandler(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		const textChannel = interaction.options.get('text-channel')?.channel as TextChannel;

		await teno.getRelayClient().syncFeedChannel(textChannel);

		await interaction.editReply({ content: `Feed channel synced successfully.` });
	} catch (error) {
		console.error(error);
		await interaction.editReply({ content: `Error syncing feed channel.` });
	}
}
