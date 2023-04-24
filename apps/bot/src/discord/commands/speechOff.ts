import type { CommandInteraction } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

export const speechOffCommand = createCommand({
	commandArgs: {
		name: 'speech-off',
		description: `Disable Teno from responding to the conversation with text-to-speech.`,
	},
	handler: speechOff,
});

async function speechOff(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		teno.disableSpeech();
		await interaction.editReply({
			content: `Teno will no longer with text-to-speech.`,
			components: [],
		});
	} catch (e) {
		await interaction.editReply({
			content: `Error turning off text-to-speech.`,
			components: [],
		});
		return;
	}
}
