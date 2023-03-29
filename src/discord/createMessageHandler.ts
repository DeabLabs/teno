import type { Message } from 'discord.js';
import type { Teno } from '../models/teno.js';

/**
 * The basic shape of a discord message parser
 */
export type MessageHandler = {
	filter: (m: Message, teno: Teno) => boolean;
	handler: (m: Message, teno: Teno) => void;
};

/**
 * Build a structure that can be used to parse incoming messages and perform actions based off of them
 *
 * @param filter function that reads incoming message and determines if it should be handled
 * @param handler function that responds to an incoming message
 */
export const createMessageHandler = (filter: MessageHandler['filter'], handler: MessageHandler['handler']) => {
	return {
		filter,
		handler,
	};
};
