import type { CommandInteraction } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const speechOnCommand = createCommand({
	commandArgs: {
		name: 'speech-on',
		description: `Enable Teno to respond to the conversation with text-to-speech.`,
	},
	handler: speechOn,
});

async function speechOn(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		teno.enableSpeech();
		await interaction.editReply({
			content: `Teno can now respond with text-to-speech.`,
			components: [],
		});
	} catch (e) {
		await interaction.editReply({
			content: `Error turning on text-to-speech.`,
			components: [],
		});
		return;
	}
}
