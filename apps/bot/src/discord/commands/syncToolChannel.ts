import type { CommandInteraction, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const syncToolChannelCommand = createCommand({
	commandArgs: {
		name: 'sync-tool-channel',
		description: 'Sync a text channel with the voice bot as a tool channel',
		options: [
			{
				name: 'text-channel',
				description: 'The text channel to sync',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildText],
			},
			{
				name: 'tool-name',
				description: 'The name of the tool',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
			{
				name: 'tool-description',
				description: 'The description of the tool',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
			{
				name: 'tool-input-guide',
				description: 'A guide on what to input into the tool',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
			{
				name: 'tool-output-guide',
				description: 'A guide on the output of the tool',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
		],
	},
	handler: syncToolChannel,
});

async function syncToolChannel(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		const textChannel = interaction.options.get('text-channel')?.channel as TextChannel;
		const toolName = interaction.options.get('tool-name')?.value as string;
		const toolDescription = interaction.options.get('tool-description')?.value as string;
		const toolInputGuide = interaction.options.get('tool-input-guide')?.value as string;
		const toolOutputGuide = interaction.options.get('tool-output-guide')?.value as string;

		await teno.getRelayClient().syncToolChannel(textChannel, {
			toolName,
			toolDescription,
			toolInputGuide,
			toolOutputGuide,
		});

		await interaction.editReply({ content: `Tool channel synced successfully.` });
	} catch (error) {
		console.error(error);
		await interaction.editReply({ content: `Error syncing tool channel.` });
	}
}
