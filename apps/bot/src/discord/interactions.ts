import { autoRenameCommand } from './commands/autoRename.js';
import { autojoinOffCommand } from './commands/autojoinOff.js';
import { joinCommand } from './commands/join.js';
import { leaveCommand } from './commands/leave.js';
import { askCommand } from './commands/ask.js';
import type { Command } from './createCommand.js';
import { renameCommand } from './commands/rename.js';
import { lockCommand } from './commands/lock.js';
import { unlockCommand } from './commands/unlock.js';
import { autojoinOnCommand } from './commands/autojoinOn.js';
import { removeMeCommand } from './commands/removeMe.js';
import { muteMeCommand } from './commands/muteMe.js';
import { unmuteMeCommand } from './commands/unmuteMe.js';
import { askPastCommand } from './commands/askPast.js';
import { speechOnCommand } from './commands/speechOn.js';
import { speechOffCommand } from './commands/speechOff.js';
import { personaOnCommand } from './commands/personaOn.js';
import { personaOffCommand } from './commands/personaOff.js';
import { messageInMeetingThreadHandler } from './messageHandlers/messageInMeetingThread.js';
import { syncToolChannelCommand } from './commands/syncToolChannel.js';
import { syncUserResponseChannelCommand } from './commands/syncUserResponseChannel.js';
import { syncFeedChannelCommand } from './commands/syncFeedChannel.js';

// Add new commands here
const commandInteractions = [
	joinCommand,
	leaveCommand,
	askCommand,
	renameCommand,
	lockCommand,
	unlockCommand,
	autoRenameCommand,
	autojoinOnCommand,
	autojoinOffCommand,
	removeMeCommand,
	muteMeCommand,
	unmuteMeCommand,
	askPastCommand,
	speechOnCommand,
	speechOffCommand,
	personaOnCommand,
	personaOffCommand,
	syncToolChannelCommand,
	syncUserResponseChannelCommand,
	syncFeedChannelCommand,
] as const;

export const interactionCommandHandlers = new Map<string, Command>();

commandInteractions.forEach((interaction) => {
	interactionCommandHandlers.set(interaction.name, interaction);
});

// Add new message handlers here
export const interactionMessageHandlers = [messageInMeetingThreadHandler] as const;
