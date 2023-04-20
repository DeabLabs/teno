import type { VoiceReceiver } from '@discordjs/voice';
import { getVoiceConnection } from '@discordjs/voice';
import type { Client, TextChannel, VoiceBasedChannel, VoiceState } from 'discord.js';
import invariant from 'tiny-invariant';
import type { PrismaClientType } from 'database';
import { userQueries, usageQueries } from 'database';

import type { RedisClient } from '@/bot.js';
import { makeTranscriptKey } from '@/utils/transcriptUtils.js';
import { generateMeetingName } from '@/services/langchain.js';

import { Transcript } from './transcript.js';
import { Utterance } from './utterance.js';

type MeetingArgs = {
	id: number;
	meetingMessageId: string;
	voiceChannelId: string;
	guildId: string;
	prismaClient: PrismaClientType;
	startTime: number;
	transcript: Transcript;
	client: Client;
	active: boolean;
	name: string;
};

type MeetingLoadArgs = Omit<MeetingArgs, 'id' | 'transcript' | 'startTime' | 'name' | 'active'> & {
	id?: number;
	active?: boolean;
	userDiscordId: string;
	redisClient: RedisClient;
};

export class Meeting {
	private prismaClient: PrismaClientType;
	private guildId: string;
	private voiceChannelId: string;
	private speaking: Set<string>;
	private ignore: Set<string>;
	private startTime: number;
	private attendees: Set<string>;
	private id: number;
	private transcript: Transcript;
	private meetingMessageId: string;
	private client: Client;
	private active = false;
	private name: string;

	private constructor({
		guildId,
		prismaClient,
		startTime,
		transcript,
		id,
		meetingMessageId,
		voiceChannelId,
		client,
		active,
		name,
	}: MeetingArgs) {
		this.id = id;
		this.meetingMessageId = meetingMessageId;
		this.guildId = guildId;
		this.voiceChannelId = voiceChannelId;
		this.startTime = startTime;
		this.prismaClient = prismaClient;
		this.client = client;
		this.speaking = new Set<string>();
		this.attendees = new Set<string>();
		this.ignore = new Set<string>();
		this.transcript = transcript;
		this.active = active;
		this.name = name;

		this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));
	}

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

			return new Meeting({
				id: _meeting.id,
				guildId: args.guildId,
				voiceChannelId: args.voiceChannelId,
				meetingMessageId: args.meetingMessageId,
				startTime: _meeting.createdAt.getTime(),
				prismaClient: args.prismaClient,
				client: args.client,
				transcript,
				active: _meeting.active,
				name: _meeting.name,
			});
		} catch (e) {
			console.error('Error loading/creating meeting: ', e);
			return null;
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
			const meetingMessage = await textChannel.send(
				`Teno is listening to a meeting in ${voiceChannel.name}. Reply to this message, or use /ask to ask Teno about it! If the meeting is locked or you are not an attendee, Teno will not respond.`,
			);

			return meetingMessage;
		} catch {
			return null;
		}
	}

	/**
	 * Creates an utterance object for a user id and voice receiver and starts the recording and transcription pipeline
	 * @param receiver The voice receiver
	 * @param userId The user id
	 * @param client The discord client
	 */
	public createUtterance(receiver: VoiceReceiver, userId: string) {
		const user = this.client.users.cache.get(userId);
		if (!user) {
			console.error('User not found.');
			return;
		}

		const utterance = new Utterance(
			receiver,
			userId,
			user.username,
			this.secondsSinceStart(),
			this.onRecordingEnd.bind(this),
			this.onTranscriptionComplete.bind(this),
		);
		utterance.process();
	}

	/**
	 * Returns the number of seconds since the meeting started
	 * @returns The number of seconds since the meeting started
	 */
	public secondsSinceStart(): number {
		return (Date.now() - this.startTime) / 1000;
	}

	/**
	 * Called when an utterance has finished recording
	 * @param utterance The utterance that has finished recording
	 */
	private onRecordingEnd(utterance: Utterance): void {
		this.stoppedSpeaking(utterance.userId);
	}

	/**
	 * Writes the transcribed utterance to the meeting's transcript
	 * @param utterance The utterance to write to the meeting's transcript
	 * @returns A promise that resolves when the utterance has been written to the transcript
	 */
	private async writeToTranscript(utterance: Utterance): Promise<void> {
		if (utterance.textContent) {
			await this.transcript.addUtterance(utterance);
		} else {
			return;
		}
	}

	/**
	 * Called when an utterance has been transcribed
	 * @param utterance The utterance that has been transcribed
	 */
	private onTranscriptionComplete(utterance: Utterance): void {
		if (!this.isIgnored(utterance.userId)) {
			this.writeToTranscript(utterance);
			if (utterance.duration) {
				usageQueries.createUsageEvent(this.prismaClient, {
					discordGuildId: this.guildId,
					discordUserId: utterance.userId,
					meetingId: this.id,
					utteranceDurationSeconds: utterance.duration,
				});
			}
		}
	}

	/**
	 * Get the voice connection for this meeting
	 * @returns The voice connection for this meeting
	 */
	public getConnection() {
		return getVoiceConnection(this.guildId);
	}

	/**
	 * Get the meeting id
	 * @returns The meeting's id
	 */
	public getId() {
		return this.id;
	}

	/**
	 * Remove a user from the speaking list, which includes all users currently speaking
	 * @param userId The user to remove
	 */
	public stoppedSpeaking(userId: string): void {
		this.speaking.delete(userId);
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

	/**
	 *  Add a user to the ignore list, which stops Teno from transcribing their speech
	 * @param userId  The user to ignore
	 */
	public ignoreUser(userId: string): void {
		this.ignore.add(userId);
	}

	/**
	 * Remove a user from the ignore list, which allows Teno to transcribe their speech
	 * @param userId The user to stop ignoring
	 */
	public stopIgnoring(userId: string): void {
		this.ignore.delete(userId);
	}

	/**
	 * Returns true if the user is on the speaking list
	 * @param userId The user to check
	 * @returns True if the user is on the speaking list
	 */
	public isSpeaking(userId: string): boolean {
		return this.speaking.has(userId);
	}

	/**
	 * Adds a user to the speaking list, which includes all users currently speaking
	 * @param userId The user to add to the speaking list
	 */
	public addSpeaking(userId: string) {
		this.speaking.add(userId);
	}

	/**
	 * Clears the speaking list, which includes all users currently speaking
	 */
	public clearSpeaking() {
		this.speaking.clear();
	}

	/**
	 * Add a user to the attendees list, which includes all users who attended the meeting or were manually added using /add
	 * @param userId The user to add to the attendees list
	 */
	public isAttendee(userId: string): boolean {
		return this.attendees.has(userId);
	}

	/**
	 * Returns true if the user is on the ignore list
	 * @param userId The user to check
	 * @returns True if the user is on the ignore list
	 * @returns False if the user is not on the ignore list
	 * @returns Null if the user is not in the meeting
	 */
	public isIgnored(userId: string): boolean {
		return this.ignore.has(userId);
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
		if (!active) return;

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
		this.clearSpeaking();
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
			this.getConnection()?.destroy();
			this.client.removeListener('voiceStateUpdate', this.handleVoiceStateUpdate);
		}
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
}
