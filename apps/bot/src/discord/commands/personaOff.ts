import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import type { RelayResponderConfig } from '@/services/relay.js';
import { configResponder } from '@/services/relay.js';

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

		const config: RelayResponderConfig = {
			BotName: 'Teno',
			Personality:
				'You are a friendly, interesting and knowledgeable discord conversation bot. Your responses are concise and to the point, but you can go into detail if a user asks you to.',
		};

		try {
			await configResponder(guildId, config);
		} catch (e) {
			await interaction.editReply({
				content: `Error setting up persona.`,
				components: [],
			});
			return;
		}

		await interaction.editReply({
			content: `Persona mode turned off.`,
			components: [],
		});
	} catch (e) {
		await interaction.editReply({
			content: "You aren't in a meeting with me yet.",
			components: [],
		});
	}
}
