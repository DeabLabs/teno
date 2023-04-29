import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const personaOffCommand = createCommand({
	commandArgs: {
		name: 'persona-off',
		description: 'Turn of persona mode.',
	},
	handler: personaOff,
});

async function personaOff(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const guildId = interaction.guildId;
	const member = interaction.member;

	try {
		invariant(prompt);
		invariant(member instanceof GuildMember);
		invariant(typeof guildId === 'string');
	} catch (e) {
		await interaction.editReply({
			content: `Sorry, I'm having trouble talking to discord right now, please try again later.`,
			components: [],
		});
		return;
	}

	try {
		const meeting = teno.getActiveMeeting();
		invariant(meeting);

		meeting.turnPersonaOff();
	} catch (e) {
		await interaction.editReply({
			content: "You aren't in a meeting with me yet.",
			components: [],
		});
	}
}
