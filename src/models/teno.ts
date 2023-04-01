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
		// cleanup all meetings
		await Promise.allSettled(this.meetings.map((meeting) => meeting.endMeeting()));

		console.log(`Teno ${this.id} cleaned up`);
	}
}
