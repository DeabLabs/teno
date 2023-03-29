import type { Guild } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import type { Command } from './createCommand.js';
import { interactionCommandHandlers } from './interactions.js';

// Convert our map of interactions (commands) to an array of commands
const commandDefinitions = Array.from(interactionCommandHandlers.values());

/**
 * From a command definition, build a SlashCommand
 */
const buildCommandMapper = (c: Command) => {
	const command = new SlashCommandBuilder().setName(c.name).setDescription(c.description);

	c.options.forEach((o) => {
		command.addStringOption((opt) => {
			opt.setName(o.name);
			opt.setRequired(!!o.required);
			if (o.description) {
				opt.setDescription(o.description);
			}

			return opt;
		});
	});

	return command;
};

const commands = commandDefinitions.map(buildCommandMapper).map((command) => command.toJSON());

export const deploy = async (guild: Guild) => {
	await guild.commands.set(commands);
};
