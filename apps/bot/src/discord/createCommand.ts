import type {
	APIApplicationCommandOptionChoice,
	ButtonInteraction,
	CommandInteraction,
	ModalSubmitInteraction,
	StringSelectMenuInteraction,
} from 'discord.js';

import type { Teno } from '@/models/teno.js';

/**
 * The shape of a user 'option' (argument) to a slash command
 */
export type CommandOption = {
	name: string;
	description?: string;
	required?: boolean;
	choices?: APIApplicationCommandOptionChoice<string>[];
};

/**
 * The basic shape of a discord SlashCommand
 */
export type Command = {
	name: string;
	description: string;
	options: CommandOption[];
	handler: (interaction: CommandInteraction, teno: Teno) => Promise<void>;
	selectMenuHandlers?: {
		customId: string;
		handler: (interaction: StringSelectMenuInteraction, teno: Teno) => Promise<void>;
	}[];
	modalMenuHandlers?: {
		customId: string;
		handler: (interaction: ModalSubmitInteraction, teno: Teno) => Promise<void>;
	}[];
	buttonHandlers?: {
		customId: string;
		handler: (interaction: ButtonInteraction, teno: Teno) => Promise<void>;
	}[];
};

type CommandDescription = {
	name: Command['name'];
	description: Command['description'];
	options?: CommandOption | CommandOption[];
};

type CreateCommandArgs = {
	commandArgs: CommandDescription;
	handler: Command['handler'];
	selectMenuHandlers?: Command['selectMenuHandlers'];
	modalMenuHandlers?: Command['modalMenuHandlers'];
	buttonHandlers?: Command['buttonHandlers'];
};

/**
 * Build a structure that can be parsed as a discord slash command
 *
 * @param name name displayed within discord for the command
 * @param description description displayed within discord for the command
 * @param handler function that is triggered when the command is called
 */
export const createCommand = ({
	commandArgs,
	handler,
	selectMenuHandlers,
	modalMenuHandlers,
	buttonHandlers,
}: CreateCommandArgs): Command => {
	const options = Array.isArray(commandArgs.options)
		? commandArgs.options
		: commandArgs.options
		? [commandArgs.options]
		: [];
	return {
		name: commandArgs.name,
		description: commandArgs.description,
		options,
		handler: (interaction, teno) => {
			if (!interaction.isCommand()) return new Promise((r) => r());

			return handler(interaction, teno);
		},
		...(selectMenuHandlers ? { selectMenuHandlers } : {}),
		...(modalMenuHandlers ? { modalMenuHandlers } : {}),
		...(buttonHandlers ? { buttonHandlers } : {}),
	};
};
