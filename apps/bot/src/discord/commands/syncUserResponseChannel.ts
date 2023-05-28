import type { CommandInteraction, TextChannel } from 'discord.js';
import { ApplicationCommandOptionType, ChannelType } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const syncUserResponseChannelCommand = createCommand({
	commandArgs: {
		name: 'sync-user-response-channel',
		description: 'Sync a text channel with the voice bot in a question-answer format',
		options: [
			{
				name: 'text-channel',
				description: 'The text channel to sync',
				type: ApplicationCommandOptionType.Channel,
				required: true,
				channelTypes: [ChannelType.GuildText],
			},
			{
				name: 'response-description',
				description: 'What kind of response the user should be asked to provide',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
		],
	},
	handler: syncUserResponseChannel,
});

async function syncUserResponseChannel(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		const textChannel = interaction.options.get('text-channel')?.channel as TextChannel;
		const responseDescription = interaction.options.get('response-description')?.value as string;

		await teno.getRelayClient().syncUserResponseChannel(textChannel, responseDescription);

		await interaction.editReply({ content: `User response channel synced successfully.` });
	} catch (error) {
		console.error(error);
		await interaction.editReply({ content: `Error syncing user response channel.` });
	}
}
