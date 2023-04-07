import { listCommand } from './commands/list.js';
import { joinCommand } from './commands/join.js';
import { leaveCommand } from './commands/leave.js';
import { askCommand } from './commands/ask.js';
import { rememberCommand } from './commands/remember.js';
import { replyToMeetingMessageHandler } from './messageHandlers/replyToMeetingMessage.js';
import type { Command } from './createCommand.js';
import { renameCommand } from './commands/rename.js';

// Add new commands here
const commandInteractions = [
	joinCommand,
	leaveCommand,
	askCommand,
	rememberCommand,
	renameCommand,
	listCommand,
] as const;

export const interactionCommandHandlers = new Map<string, Command>();

commandInteractions.forEach((interaction) => {
	interactionCommandHandlers.set(interaction.name, interaction);
});

// Add new message handlers here
export const interactionMessageHandlers = [replyToMeetingMessageHandler] as const;
