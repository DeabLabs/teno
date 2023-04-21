import type { Client, Guild, Interaction, Message } from 'discord.js';
import { TextChannel } from 'discord.js';
import { VoiceChannel } from 'discord.js';
import { Events } from 'discord.js';
import type { PrismaClientType } from 'database';
import { getVoiceConnection } from '@discordjs/voice';
import invariant from 'tiny-invariant';

import { interactionCommandHandlers, interactionMessageHandlers } from '@/discord/interactions.js';
import type { RedisClient } from '@/bot.js';
import { createMeeting } from '@/utils/createMeeting.js';
import { playTextToSpeech } from '@/services/textToSpeech.js';

import type { Meeting } from './meeting.js';

export class Teno {
	public id: string;
	private client: Client;
	private meetings: Meeting[] = [];
	private guild: Guild;
	private redisClient: RedisClient;
	private prismaClient: PrismaClientType;
	private speaking = false;
	private thinking = false;

	constructor({
		client,
		guild,
		redisClient,
		prismaClient,
	}: {
		client: Client;
		guild: Guild;
		redisClient: RedisClient;
		prismaClient: PrismaClientType;
	}) {
		this.client = client;
		this.guild = guild;
		this.id = guild.id;
		this.redisClient = redisClient;
		this.prismaClient = prismaClient;
		this.initialize();
	}

	private async initialize() {
		await this.getPrismaClient().guild.upsert({
			where: {
				guildId: this.id,
			},
			update: {
				name: this.guild.name,
			},
			create: {
				name: this.guild.name,
				guildId: this.id,
			},
		});
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

		this.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
			if (!newState.guild.id || newState.guild.id != this.id || !(newState.channel instanceof VoiceChannel)) return;

			const channelId = newState.channelId;
			// if a user joins a voice channel, and the user has autojoin enabled for that channel, and teno is not already in another channel, join the channel
			try {
				invariant(!getVoiceConnection(this.id));
				invariant(channelId);

				const user = await this.getPrismaClient().user.findFirst({
					where: {
						discordId: newState.id,
					},
				});

				invariant(user);

				const autoJoin = await this.getPrismaClient().autoJoin.findFirst({
					where: {
						guildId: this.id,
						userId: user?.id,
						channelId,
					},
				});

				invariant(autoJoin);

				const voiceChannel = this.client.channels.cache.get(channelId);
				const textChannel = this.client.channels.cache.get(autoJoin.textChannelId);
				invariant(voiceChannel instanceof VoiceChannel);
				invariant(textChannel instanceof TextChannel);

				await createMeeting({
					teno: this,
					guildId: this.id,
					userDiscordId: user.discordId,
					voiceChannel,
					textChannel,
				});
			} catch {
				// ignore
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

	getPrismaClient(): PrismaClientType {
		return this.prismaClient;
	}

	getRedisClient(): RedisClient {
		return this.redisClient;
	}

	getMeetings() {
		return this.meetings;
	}

	getThinking() {
		return this.thinking;
	}

	setThinking(thinking: boolean) {
		this.thinking = thinking;
	}

	getSpeaking() {
		return this.speaking;
	}

	setSpeaking(speaking: boolean) {
		this.speaking = speaking;
	}

	async getVoiceService() {
		const vs = await this.getPrismaClient().guild.findUnique({
			where: {
				guildId: this.id,
			},
			include: { voiceService: true },
		});

		return vs?.voiceService ?? undefined;
	}

	saySomething = async (text: string, interruptible?: boolean) => {
		if (!this.speaking) {
			this.speaking = !interruptible;

			const vConfig = await this.getVoiceService();

			if (vConfig) {
				await playTextToSpeech({
					apiKey: vConfig.apiKey,
					voiceId: vConfig.voiceKey,
					text,
					connection: getVoiceConnection(this.id),
				});
			}

			this.speaking = false;
		}
	};

	cleanup = async () => {
		const p = this.meetings.map((meeting) => meeting.endMeeting());

		if (p.length) {
			await Promise.allSettled(p);
		}

		console.log(`Teno ${this.id} cleaned up`);
	};
}
