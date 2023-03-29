import { joinCommand } from './commands/join.js';
import { leaveCommand } from './commands/leave.js';
import { replyToMeetingMessageHandler } from './messageHandlers/replyToMeetingMessage.js';
import type { Command } from './createCommand.js';

// Add new commands here
const commandInteractions = [joinCommand, leaveCommand] as const;

export const interactionCommandHandlers = new Map<string, Command>();

commandInteractions.forEach((interaction) => {
	interactionCommandHandlers.set(interaction.name, interaction);
});

// Add new message handlers here
export const interactionMessageHandlers = [replyToMeetingMessageHandler] as const;
