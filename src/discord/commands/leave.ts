import { getVoiceConnection } from '@discordjs/voice';
import type { CommandInteraction, Snowflake } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';

export const leaveCommand = createCommand(
	{
		name: 'leave',
		description: 'Leave the voice channel',
	},
	leave,
);

async function leave(interaction: CommandInteraction) {
	const connection = getVoiceConnection(interaction.guildId as Snowflake);
	if (connection) {
		connection.destroy();
		await interaction.reply({ ephemeral: true, content: 'Left the channel!' });
	} else {
		await interaction.reply({ ephemeral: true, content: 'Not playing in this server!' });
	}
}
