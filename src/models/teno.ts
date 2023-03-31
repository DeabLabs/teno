import type { Client, Guild, Interaction, Message } from 'discord.js';
import { Events } from 'discord.js';

import { interactionCommandHandlers, interactionMessageHandlers } from '@/discord/interactions.js';
import type { RedisClient } from '@/bot.js';

import type { Meeting } from './meeting.js';

export class Teno {
	id: string;
	client: Client;
	meetings: Meeting[] = [];
	guild: Guild;
	redisClient: RedisClient;

	constructor({ client, guild, redisClient }: { client: Client; guild: Guild; redisClient: RedisClient }) {
		this.client = client;
		this.guild = guild;
		this.id = guild.id;
		this.redisClient = redisClient;
		this.setupClient();
	}

	private setupClient() {
		// Command listener
		this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
			if (!interaction.isCommand() || !interaction.guildId || interaction.guildId != this.id) return;

			const command = interactionCommandHandlers.get(interaction.commandName);

			try {
				if (command) {
					await command.handler(interaction, this);
				} else {
					await interaction.reply('Unknown command');
				}
			} catch (error) {
				console.warn(error);
			}
		});

		this.client.on(Events.MessageCreate, async (message: Message) => {
			for (const messageHandler of interactionMessageHandlers) {
				if (messageHandler.filter(message, this)) {
					messageHandler.handler(message, this);
				}
			}
		});

		console.log(`Teno ${this.id} ready`);
	}

	public addMeeting(meeting: Meeting) {
		this.meetings.push(meeting);
	}
}
