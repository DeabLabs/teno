import type { Client, TextChannel, VoiceBasedChannel, VoiceState } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ThreadAutoArchiveDuration } from 'discord.js';
import { bold } from 'discord.js';
import { time } from 'discord.js';
import { channelMention } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import invariant from 'tiny-invariant';
import type { PrismaClientType } from 'database';
import { userQueries, usageQueries } from 'database';

import type { RedisClient } from '@/bot.js';
import { makeTranscriptKey } from '@/utils/transcriptUtils.js';
import { generateMeetingName } from '@/services/langchain.js';
import type { VoiceRelayClient } from '@/services/relaySDK.js';

import type { Teno } from './teno.js';
import { Transcript } from './transcript.js';

type MeetingArgs = {
	id: number;
	meetingMessageId: string;
	voiceChannelId: string;
	guildId: string;
	prismaClient: PrismaClientType;
	voiceRelayClient: VoiceRelayClient;
	teno: Teno;
	startTime: number;
	transcript: Transcript;
	client: Client;
	active: boolean;
	name: string;
	authorName: string;
	authorDiscordId: string;
};

type MeetingLoadArgs = Omit<MeetingArgs, 'id' | 'transcript' | 'startTime' | 'name' | 'active' | 'authorName'> & {
	id?: number;
	active?: boolean;
	userDiscordId: string;
	redisClient: RedisClient;
};

export type Persona = {
	name: string;
	description: string;
};

export class Meeting {
	private prismaClient: PrismaClientType;
	private voiceRelayClient: VoiceRelayClient;
	private guildId: string;
	private voiceChannelId: string;
	private startTime: number;
	private attendees: Set<string>;
	private id: number;
	private authorName: string;
	private authorDiscordId: string;
	private transcript: Transcript;
	private meetingMessageId: string;
	private client: Client;
	private active = false;
	private name: string;
	private teno: Teno;
	private meetingTimeout: NodeJS.Timeout | null = null;
	private persona: Persona | null = null;
	private render = true;

	private constructor({
		guildId,
		prismaClient,
		voiceRelayClient,
		startTime,
		transcript,
		id,
		meetingMessageId,
		voiceChannelId,
		client,
		active,
		authorName,
		authorDiscordId,
		name,
		teno,
	}: MeetingArgs) {
		this.id = id;
		this.meetingMessageId = meetingMessageId;
		this.guildId = guildId;
		this.voiceChannelId = voiceChannelId;
		this.startTime = startTime;
		this.prismaClient = prismaClient;
		this.voiceRelayClient = voiceRelayClient;
		this.client = client;
		this.attendees = new Set<string>();
		this.transcript = transcript;
		this.active = active;
		this.authorName = authorName;
		this.authorDiscordId = authorDiscordId;
		this.name = name;
		this.teno = teno;

		this.renderMeetingMessage = this.renderMeetingMessage.bind(this);
		this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));

		this.renderMeetingMessage();

		this.teno.getClient().on('interactionCreate', async (interaction) => {
			if (!interaction.isButton()) return;
			if (interaction.customId === `${this.meetingMessageId}-speechoff`) {
				await interaction.deferReply({
					ephemeral: true,
				});
				await this.teno.getRelayClient().updateSpeakingMode('NeverSpeak');
				await interaction.editReply({
					content: 'Teno will no longer respond to the conversation with text-to-speech.',
				});
			} else if (interaction.customId === `${this.meetingMessageId}-speechon`) {
				await interaction.deferReply({
					ephemeral: true,
				});
				await this.teno.getRelayClient().updateSpeakingMode('AutoSleep');
				await interaction.editReply({
					content: 'Teno will now respond to the conversation with text-to-speech.',
				});
			} else if (interaction.customId === `${this.meetingMessageId}-alwaysrespondon`) {
				await interaction.deferReply({
					ephemeral: true,
				});
				await this.teno.getRelayClient().updateSpeakingMode('AlwaysSpeak');
				await interaction.editReply({
					content: 'Teno will now always respond to the conversation with text-to-speech.',
				});
			} else if (interaction.customId === `${this.meetingMessageId}-alwaysrespondoff`) {
				await interaction.deferReply({
					ephemeral: true,
				});
				await this.teno.getRelayClient().updateSpeakingMode('AutoSleep');
				await interaction.editReply({
					content: 'Teno will now respond to the conversation with text-to-speech.',
				});
			} else if (interaction.customId === `${this.meetingMessageId}-leave`) {
				await interaction.deferReply({
					ephemeral: true,
				});
				await this.endMeeting();
				await interaction.editReply({
					content: 'Teno has left the call.',
				});
			}
		});
	}

	getTeno = () => {
		return this.teno;
	};

	static async load(args: MeetingLoadArgs) {
		try {
			const user = await userQueries.getUser(args.prismaClient, {
				discordId: args.userDiscordId,
			});
			invariant(user, 'User not found');
			const _meeting = await args.prismaClient.meeting.upsert({
				where: { id: args?.id ?? -1 },
				create: {
					name: Meeting.createMeetingName(args.voiceChannelId, Date.now()),
					guildId: args.guildId,
					authorId: user.id,
					active: true,
					channelId: args.voiceChannelId,
					meetingMessageId: args.meetingMessageId,
				},
				update: {},
				include: {
					author: {
						select: {
							name: true,
							id: true,
							discordId: true,
						},
					},
				},
			});
			const transcript = await Transcript.load({
				redisClient: args.redisClient,
				meetingId: _meeting.id,
				prismaClient: args.prismaClient,
				transcriptKey: makeTranscriptKey({
					guildId: args.guildId,
					meetingMessageId: args.meetingMessageId,
					timestamp: _meeting.createdAt.toISOString(),
				}),
			});
			invariant(transcript);

			await args.teno.setActiveMeeting(_meeting.id);
			await args.teno.fetchSpeechOn();

			return new Meeting({
				id: _meeting.id,
				guildId: args.guildId,
				voiceChannelId: args.voiceChannelId,
				meetingMessageId: args.meetingMessageId,
				startTime: _meeting.createdAt.getTime(),
				prismaClient: args.prismaClient,
				voiceRelayClient: args.voiceRelayClient,
				client: args.client,
				transcript,
				active: _meeting.active,
				name: _meeting.name,
				teno: args.teno,
				authorName: _meeting.author.name ?? 'Someone',
				authorDiscordId: _meeting.author.discordId,
			});
		} catch (e) {
			console.error('Error loading/creating meeting: ', e);
			return null;
		}
	}

	/**
	 * Iterate through all channels in the client cache, then for each channel, attempt to fetch the meeting message by meeting mesage id in the channel,
	 * if the meeting message ID is found, return the channel and the message object
	 */
	public async findMeetingMessage() {
		for (const channel of this.client.channels.cache.values()) {
			if (channel.isTextBased()) {
				try {
					const message = await channel.messages.fetch(this.meetingMessageId);
					if (message) {
						return { channel, message };
					}
				} catch (e) {
					// ignore
				}
			}
		}
		return null;
	}

	private async updateMeetingMessage(done: boolean) {
		const result = await this.findMeetingMessage();

		if (result) {
			const { message } = result;

			const seconds = Math.floor(this.startTime / 1000);

			const speechMode = this.teno.getRelayClient().getConfig().VoiceUXConfig.SpeakingMode;

			let speechState = '';

			if (speechMode === 'NeverSpeak') {
				speechState = 'Asleep';
			} else if (speechMode === 'AutoSleep') {
				speechState = this.teno.getRelayClient().getState();
			} else if (speechMode === 'AlwaysSpeak') {
				speechState = 'Awake';
			}

			const embed = new EmbedBuilder().setColor('Green').addFields(
				{
					name: 'Channel',
					value: channelMention(this.voiceChannelId),
					inline: true,
				},
				{
					name: 'Attendees',
					value: String(this.attendees.size),
					inline: true,
				},
				{
					name: 'Started At',
					value: `${time(seconds)}\n(${time(seconds, 'R')})`,
				},
				...(done
					? []
					: [
							{
								name: 'Speech state',
								value: speechState,
							},
					  ]),
			);
			if (done) {
				embed.setTitle(this.getName()).setDescription(bold(`✅ Meeting over`));
			} else {
				embed.setTitle(`Meeting started by ${this.authorName}`).setDescription(bold('📝 Teno is listening...'));
			}

			const authorAvatarUrl = this.client.users.cache.get(this.authorDiscordId)?.avatarURL();

			if (authorAvatarUrl) {
				embed.setThumbnail(authorAvatarUrl);
			}

			// Create button
			const currentSpeechMode = this.teno.getRelayClient().getConfig().VoiceUXConfig.SpeakingMode;
			let speechButtonId = '';
			let speechButtonLabel = '';

			let sleepButtonId = '';
			let sleepButtonLabel = '';

			const leaveButtonId = `${this.meetingMessageId}-leave`;
			const leaveButtonLabel = 'Leave call';

			if (currentSpeechMode === 'AutoSleep') {
				speechButtonId = `${this.meetingMessageId}-speechoff`;
				speechButtonLabel = 'Turn Speech Off';
				sleepButtonId = `${this.meetingMessageId}-alwaysrespondon`;
				sleepButtonLabel = 'Never sleep';
			} else if (currentSpeechMode === 'NeverSpeak') {
				speechButtonId = `${this.meetingMessageId}-speechon`;
				speechButtonLabel = 'Turn Speech On';
				sleepButtonId = `${this.meetingMessageId}-alwaysrespondon`;
				sleepButtonLabel = 'Never sleep';
			} else if (currentSpeechMode === 'AlwaysSpeak') {
				sleepButtonId = `${this.meetingMessageId}-alwaysrespondoff`;
				sleepButtonLabel = 'Allow sleep';
				speechButtonId = `${this.meetingMessageId}-speechoff`;
				speechButtonLabel = 'Turn Speech Off';
			}

			const speechButton = new ButtonBuilder()
				.setCustomId(speechButtonId)
				.setLabel(speechButtonLabel)
				.setStyle(ButtonStyle.Primary);

			const sleepButton = new ButtonBuilder()
				.setCustomId(sleepButtonId)
				.setLabel(sleepButtonLabel)
				.setStyle(ButtonStyle.Primary);

			const leaveButton = new ButtonBuilder()
				.setCustomId(leaveButtonId)
				.setLabel(leaveButtonLabel)
				.setStyle(ButtonStyle.Danger);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents([speechButton, sleepButton, leaveButton]);

			// Update message with embed and button
			await message.edit({ embeds: [embed], content: '', components: done ? [] : [row] });
		}
	}

	/**
	 * - Get the text channel for the meeting message
	 * - Update the meeting message with current meeting state
	 */
	private async renderMeetingMessage() {
		this.updateMeetingMessage(!this.render);

		if (this.render) {
			this.meetingTimeout = setTimeout(() => {
				this.renderMeetingMessage();
			}, 1000);
		}
	}

	/**
	 * Creates a meeting name from a voice channel id and a date (<meetingId>-<date in milliseconds>)
	 * @param voiceChannelId The voice channel id
	 * @param date The date
	 * @returns The meeting name
	 */
	static createMeetingName(voiceChannelId: string, date: number) {
		return `${voiceChannelId}-${new Date(date).toISOString()}`;
	}

	/**
	 * Sends the meetingMessage in response to a user inviting Teno to a voice channel
	 * @param interaction The interaction that invoked the command
	 */
	static async sendMeetingMessage({
		voiceChannel,
		textChannel,
	}: {
		voiceChannel: VoiceBasedChannel;
		textChannel: TextChannel;
	}) {
		try {
			const meetingMessage = await textChannel.send({
				embeds: [
					new EmbedBuilder()
						.setTitle('Starting meeting...')
						.setDescription(`A meeting is starting in ${channelMention(voiceChannel.id)}`),
				],
			});

			const thread = await meetingMessage.startThread({
				name: 'Meeting discussion thread',
				autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
			});

			thread.send('Talk to Teno about the meeting here');

			return meetingMessage;
		} catch {
			return null;
		}
	}

	/**
	 * Returns the number of seconds since the meeting started
	 * @returns The number of seconds since the meeting started
	 */
	public secondsSinceStart(): number {
		return (Date.now() - this.startTime) / 1000;
	}

	/**
	 * Get the meeting id
	 * @returns The meeting's id
	 */
	public getId() {
		return this.id;
	}

	/**
	 * Add a user to the attendees list, which allows them to ask Teno about the meeting
	 * @param userId The user to add
	 */
	public async addMember(userId: string, username: string, discriminator: string) {
		const user = await userQueries.createOrGetUser(this.prismaClient, {
			discordId: userId,
			name: username,
			discriminator,
		});
		invariant(user);
		await this.prismaClient.meeting.update({
			where: { id: this.id },
			data: {
				attendees: {
					connect: {
						id: user.id,
					},
				},
			},
		});
		this.attendees.add(userId);
	}

	private async handleVoiceStateUpdate(prevState: VoiceState) {
		// if teno is the only one in the channel, stop the meeting and remove teno from the channel
		const tenoUser = this.client?.user?.id;
		const vc = this.client.channels.cache.get(this.voiceChannelId);
		const active = await this.getActive();
		if (
			prevState?.channel?.id === this.voiceChannelId &&
			active &&
			tenoUser &&
			vc &&
			vc.isVoiceBased() &&
			// only end the meeting if the vc being updated is the meeting vc
			vc.id === this.getVoiceChannelId() &&
			vc.members.size === 1 &&
			vc.members.has(tenoUser)
		) {
			this.endMeeting();

			this.client.removeListener('voiceStateUpdate', this.handleVoiceStateUpdate);
		}
	}

	/**
	 *  Add a user to the ignore list, which stops Teno from transcribing their speech
	 * @param userId  The user to ignore
	 */
	public ignoreUser(userId: string): void {
		try {
			this.voiceRelayClient.ignoreUser(userId);
		} catch (e) {
			console.error(e);
		}
	}

	/**
	 * Remove a user from the ignore list, which allows Teno to transcribe their speech
	 * @param userId The user to stop ignoring
	 */
	public stopIgnoring(userId: string): void {
		try {
			this.voiceRelayClient.stopIgnoringUser(userId);
		} catch (e) {
			console.error(e);
		}
	}

	/**
	 * Add a user to the attendees list, which includes all users who attended the meeting or were manually added using /add
	 * @param userId The user to add to the attendees list
	 */
	public isAttendee(userId: string): boolean {
		return this.attendees.has(userId);
	}

	/**
	 * Returns the timestamp of when the meeting started in milliseconds since the epoch
	 * @returns The timestamp of when the meeting started in milliseconds since the epoch
	 */
	public getTimestamp(): number {
		return this.startTime;
	}

	/**
	 * Returns the id of the meetingMessage
	 * @returns The id of the meetingMessage
	 */
	public getMeetingMessageId(): string {
		return this.meetingMessageId;
	}

	/**
	 * Returns the id of the voice channel for this meeting
	 * @returns The id of the voice channel for this meeting
	 */
	public getVoiceChannelId(): string {
		return this.voiceChannelId;
	}

	/**
	 * Returns the transcript of this meeting
	 * @returns The transcript of this meeting
	 */
	public getTranscript(): Transcript {
		return this.transcript;
	}

	/**
	 * Returns true if the meeting is active
	 * @returns	True if the meeting is active
	 */
	public async getActive() {
		return (
			await this.prismaClient.meeting.findUnique({
				where: { id: this.id },
				select: { active: true },
			})
		)?.active;
	}

	/**
	 * Returns the name of the meeting
	 *
	 * @returns The name of the meeting
	 */
	public getName() {
		return this.name;
	}

	/**
	 * Returns the manuallyRenamed property of the meeting from the db
	 */
	public async getManuallyRenamed() {
		const meeting = await this.prismaClient.meeting.findUnique({
			where: { id: this.id },
		});

		return meeting?.manuallyRenamed;
	}

	/**
	 * Set the name of the meeting in the db and class
	 */
	public async setName(name: string) {
		try {
			await this.prismaClient.meeting.update({
				where: { id: this.id },
				data: {
					name,
					manuallyRenamed: true,
				},
			});
			this.name = name;
		} catch (e) {
			console.log(e);
		}
	}

	/**
	 * Set the active state of the meeting in the db and class
	 */
	public async setActive(active: boolean) {
		try {
			await this.prismaClient.meeting.update({
				where: { id: this.id },
				data: {
					active,
				},
			});
			this.active = active;
		} catch (e) {
			console.log(e);
		}
	}

	/**
	 * Set the meeting duration based on the meeting's start time and the current time
	 */
	public async updateDuration() {
		const duration = Date.now() - this.startTime;
		try {
			await this.prismaClient.meeting.update({
				where: { id: this.id },
				data: {
					duration,
				},
			});
		} catch (e) {
			console.log(e);
		}
	}

	/**
	 * Ends the meeting
	 */
	public async endMeeting(): Promise<void> {
		const active = await this.getActive();
		if (!active) {
			console.log('Meeting not active');
			return;
		}

		// Send join request to voice relay
		try {
			await this.voiceRelayClient.leaveCall();
		} catch (e) {
			console.error(e);
		}

		console.log('Ending meeting', this.getId());
		await this.setActive(false);
		await this.updateDuration();
		// Rename the meeting based on the transcript
		const manuallyRenamed = await this.getManuallyRenamed();
		if (!manuallyRenamed) {
			const resolved = await this.autoName();
			if (resolved.status === 'success') {
				await this.setName(resolved.answer);
			}
		}

		await this.teno.syncSpeechOn();
		this.teno.setActiveMeeting(null);
		this.render = false;
	}

	private async autoName() {
		console.log('Generating automatic meeting name');
		const transcript = await this.getTranscript().getCleanedTranscript();

		const resolved = await generateMeetingName(transcript);

		if (resolved.status === 'success') {
			usageQueries.createUsageEvent(this.prismaClient, {
				discordGuildId: this.guildId,
				meetingId: this.id,
				languageModel: resolved.languageModel,
				promptTokens: resolved.promptTokens,
				completionTokens: resolved.completionTokens,
			});
		}
		return resolved;
	}

	public async setPersona(persona: Persona) {
		try {
			await this.voiceRelayClient.updatePersona(persona.name, persona.description);
		} catch (e) {
			console.error(e);
			return;
		}

		this.persona = persona;
	}

	public turnPersonaOff() {
		const botName = 'Teno';
		const personality =
			'You are a friendly, interesting and knowledgeable discord conversation bot. Your responses are concise and to the point, but you can go into detail if a user asks you to.';

		try {
			this.voiceRelayClient.updatePersona(botName, personality);
		} catch (e) {
			console.error(e);
			return;
		}

		this.persona = null;
	}

	public getPersona(): Persona | null {
		if (this.persona) {
			return this.persona;
		}
		return null;
	}
}
