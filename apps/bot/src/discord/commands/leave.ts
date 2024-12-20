import type { CommandInteraction } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { getActiveMeetingFromInteraction } from '@/queries/meeting.js';

export const leaveCommand = createCommand({
	commandArgs: {
		name: 'leave',
		description: 'Leave the voice channel',
	},
	handler: leave,
});

async function leave(interaction: CommandInteraction, teno: Teno) {
	const guildId = interaction.guildId;
	if (!guildId) {
		await interaction.reply({ ephemeral: true, content: 'Error getting guild id' });
		return;
	}

	const activeMeetingDb = await getActiveMeetingFromInteraction(interaction, teno.getPrismaClient());
	const activeMeeting = teno.getMeeting(activeMeetingDb?.id);
	activeMeeting?.endMeeting();

	await interaction.reply({ ephemeral: true, content: 'Left the channel!' });
}
