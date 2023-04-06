import type { Client, Guild, Interaction, Message } from 'discord.js';
import { Events } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

import { interactionCommandHandlers, interactionMessageHandlers } from '@/discord/interactions.js';
import type { RedisClient } from '@/bot.js';

import type { Meeting } from './meeting.js';

export class Teno {
	private id: string;
	private client: Client;
	private meetings: Meeting[] = [];
	private guild: Guild;
	private redisClient: RedisClient;
	private prismaClient: PrismaClient;

	constructor({
		client,
		guild,
		redisClient,
		prismaClient,
	}: {
		client: Client;
		guild: Guild;
		redisClient: RedisClient;
		prismaClient: PrismaClient;
	}) {
		this.client = client;
		this.guild = guild;
		this.id = guild.id;
		this.redisClient = redisClient;
		this.prismaClient = prismaClient;
		this.setupClient();
	}

	private setupClient() {
		// Command listener
		this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
			if (!interaction.guildId || interaction.guildId != this.id) return;

			if (interaction.isCommand()) {
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
			} else if (interaction.isStringSelectMenu()) {
				const commands = Array.from(interactionCommandHandlers.values()).flatMap((c) => {
					if (c?.selectMenuHandlers) {
						return c.selectMenuHandlers.filter((sm) => sm.customId === interaction.customId);
					}
					return [];
				});

				try {
					if (commands.length) {
						const promises = commands.map((c) => c.handler(interaction, this));
						await Promise.allSettled(promises);
					} else {
						await interaction.reply('Unknown command');
					}
				} catch (error) {
					console.warn(error);
				}
			} else if (interaction.isModalSubmit()) {
				const commands = Array.from(interactionCommandHandlers.values()).flatMap((c) => {
					if (c?.modalMenuHandlers) {
						return c.modalMenuHandlers.filter((mm) => mm.customId === interaction.customId);
					}
					return [];
				});

				try {
					if (commands.length) {
						const promises = commands.map((c) => c.handler(interaction, this));
						await Promise.allSettled(promises);
					} else {
						await interaction.reply('Unknown modal submission');
					}
				} catch (error) {
					console.warn(error);
				}
			} else if (interaction.isButton()) {
				const commands = Array.from(interactionCommandHandlers.values()).flatMap((c) => {
					if (c?.buttonHandlers) {
						return c.buttonHandlers.filter((mm) => mm.customId === interaction.customId);
					}
					return [];
				});

				try {
					if (commands.length) {
						const promises = commands.map((c) => c.handler(interaction, this));
						await Promise.allSettled(promises);
					} else {
						await interaction.reply('Unknown button submission');
					}
				} catch (error) {
					console.warn(error);
				}
			}
		});

		this.client.on(Events.MessageCreate, async (message: Message) => {
			if (!message.guildId || message.guildId != this.id) return;
			for (const messageHandler of interactionMessageHandlers) {
				const passedFilter = await messageHandler.filter(message, this);
				if (passedFilter) {
					messageHandler.handler(message, this);
				}
			}
		});

		console.log(`Teno ${this.id} ready`);
	}

	public addMeeting(meeting: Meeting) {
		this.meetings.push(meeting);
	}

	public getMeeting(id?: number | null) {
		return this.meetings.find((meeting) => meeting.getId() === id);
	}

	getClient(): Client {
		return this.client;
	}

	getPrismaClient(): PrismaClient {
		return this.prismaClient;
	}

	getRedisClient(): RedisClient {
		return this.redisClient;
	}

	getMeetings() {
		return this.meetings;
	}

	async cleanup() {
		await Promise.allSettled(
			this.meetings.filter((meeting) => meeting.getActive()).map((meeting) => meeting.endMeeting()),
		);

		console.log(`Teno ${this.id} cleaned up`);
	}
}
