import { getVoiceConnection } from '@discordjs/voice';
import type { CommandInteraction, Snowflake } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { getActiveMeetingFromInteraction } from '@/queries/meeting.js';

export const leaveCommand = createCommand(
	{
		name: 'leave',
		description: 'Leave the voice channel',
	},
	leave,
);

async function leave(interaction: CommandInteraction, teno: Teno) {
	const connection = getVoiceConnection(interaction.guildId as Snowflake);
	if (connection) {
		connection.destroy();
		const activeMeetingDb = await getActiveMeetingFromInteraction(interaction, teno.getPrismaClient());
		const activeMeeting = teno.getMeeting(activeMeetingDb?.id);
		activeMeeting?.endMeeting();
		await interaction.reply({ ephemeral: true, content: 'Left the channel!' });
	} else {
		await interaction.reply({ ephemeral: true, content: 'Not playing in this server!' });
	}
}
