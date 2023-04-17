import { autoRenameCommand } from './commands/autoRename.js';
import { autojoinOffCommand } from './commands/autojoinOff.js';
import { listCommand } from './commands/list.js';
import { joinCommand } from './commands/join.js';
import { leaveCommand } from './commands/leave.js';
import { askCommand } from './commands/ask.js';
import { replyToMeetingMessageHandler } from './messageHandlers/replyToMeetingMessage.js';
import type { Command } from './createCommand.js';
import { renameCommand } from './commands/rename.js';
import { lockCommand } from './commands/lock.js';
import { unlockCommand } from './commands/unlock.js';
import { autojoinOnCommand } from './commands/autojoinOn.js';
import { removeMeCommand } from './commands/removeMe.js';
import { muteMeCommand } from './commands/muteMe.js';
import { unmuteMeCommand } from './commands/unmuteMe.js';
import { askPastCommand } from './commands/askPast.js';

// Add new commands here
const commandInteractions = [
	joinCommand,
	leaveCommand,
	askCommand,
	autoRenameCommand,
	renameCommand,
	listCommand,
	lockCommand,
	unlockCommand,
	autojoinOnCommand,
	autojoinOffCommand,
	removeMeCommand,
	muteMeCommand,
	unmuteMeCommand,
	askPastCommand,
] as const;

export const interactionCommandHandlers = new Map<string, Command>();

commandInteractions.forEach((interaction) => {
	interactionCommandHandlers.set(interaction.name, interaction);
});

// Add new message handlers here
export const interactionMessageHandlers = [replyToMeetingMessageHandler] as const;
