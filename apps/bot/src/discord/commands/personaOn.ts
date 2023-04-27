import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const personaOnCommand = createCommand({
	commandArgs: {
		name: 'persona-on',
		description: 'Teno will speak from the perspective of a persona you describe.',
		options: [
			{
				name: 'name',
				description: 'The name of the persona you want Teno to speak as.',
				required: true,
			},
			{
				name: 'description',
				description: 'A description of the persona you want Teno to speak as, including sample speech.',
				required: true,
			},
		],
	},
	handler: personaOn,
});

async function personaOn(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const name = String(interaction.options.get('name')?.value ?? '');
	const description = String(interaction.options.get('description')?.value ?? '');
	const guildId = interaction.guildId;
	const member = interaction.member;

	try {
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

		meeting.setPersona({ name, description });
		console.log(meeting.getPersona()?.name);

		await interaction.editReply({
			content: `Teno will now speak from the persona of ${meeting.getPersona()?.name}.`,
			components: [],
		});
		return;
	} catch (e) {
		await interaction.editReply({
			content: "You aren't in a meeting with me yet.",
			components: [],
		});
	}
}
