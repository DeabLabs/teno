import type { VoiceReceiver } from '@discordjs/voice';
import { getVoiceConnection } from '@discordjs/voice';
import type { Client, CommandInteraction, Message } from 'discord.js';
import { TextChannel } from 'discord.js';
import { GuildMember } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import invariant from 'tiny-invariant';

import type { RedisClient } from '@/bot.js';
import { makeTranscriptKey } from '@/utils/transcriptUtils.js';
import { createOrGetUser } from '@/queries/user.js';

import { Transcript } from './transcript.js';
import { Utterance } from './utterance.js';

type MeetingArgs = {
	id: number;
	meetingMessageId: string;
	textChannelId: string;
	voiceChannelId: string;
	guildId: string;
	redisClient: RedisClient;
	prismaClient: PrismaClient;
	startTime: number;
	transcript: Transcript;
};

type MeetingLoadArgs = Omit<MeetingArgs, 'id' | 'transcript' | 'startTime'> & {
	id?: number;
	userDiscordId: string;
};

export class Meeting {
	private prismaClient: PrismaClient;
	private redisClient: RedisClient;
	public guildId: string;
	public textChannelId: string;
	public speaking: Set<string>;
	public ignore: Set<string>;
	public startTime: number;
	public inMeeting: Set<string>;
	public voiceChannelId: string;
	public members: Set<string>;
	public id: number;
	public initialized = false;
	public transcript: Transcript;
	public meetingMessageId: string;

	private constructor({
		meetingMessageId,
		textChannelId,
		voiceChannelId,
		guildId,
		redisClient,
		prismaClient,
		startTime,
		transcript,
		id,
	}: MeetingArgs) {
		this.id = id;
		this.textChannelId = textChannelId;
		this.voiceChannelId = voiceChannelId;
		this.guildId = guildId;
		this.meetingMessageId = meetingMessageId;
		this.startTime = startTime;
		this.prismaClient = prismaClient;
		this.redisClient = redisClient;

		this.speaking = new Set<string>();
		this.members = new Set<string>();
		this.inMeeting = new Set<string>();
		this.ignore = new Set<string>();
		this.transcript = transcript;
	}

	static async load(args: MeetingLoadArgs) {
		try {
			const user = await createOrGetUser(args.prismaClient, { discordId: args.userDiscordId });
			const _meeting = await args.prismaClient.meeting.upsert({
				where: { id: args?.id ?? -1 },
				create: {
					name: Meeting.createMeetingName(args.voiceChannelId, Date.now()),
					authorId: user.id,
				},
				update: {},
			});
			const transcript = await Transcript.load({
				redisClient: args.redisClient,
				meetingId: _meeting.id,
				prismaClient: args.prismaClient,
				transcriptKey: makeTranscriptKey(args.guildId, args.textChannelId, args.meetingMessageId),
			});
			invariant(transcript);

			return new Meeting({
				id: _meeting.id,
				guildId: args.guildId,
				voiceChannelId: args.voiceChannelId,
				textChannelId: args.textChannelId,
				meetingMessageId: args.meetingMessageId,
				startTime: _meeting.createdAt.getTime(),
				redisClient: args.redisClient,
				prismaClient: args.prismaClient,
				transcript,
			});
		} catch (e) {
			console.error('Error loading/creating meeting: ', e);
			return null;
		}
	}

	static createMeetingName(voiceChannelId: string, date: number) {
		return `${voiceChannelId}-${new Date(date).toISOString()}`;
	}

	static async sendMeetingMessage(interaction: CommandInteraction) {
		const member = interaction.member;
		if (member instanceof GuildMember && member.voice.channel) {
			const meetingMessage = (await interaction.followUp(
				`Teno is listening to a meeting in ${member.voice.channel.name}. Reply to this message to ask Teno about it!`,
			)) as Message;
			return meetingMessage;
		} else {
			console.error('Could not get member from interaction');
		}
		return;
	}

	public async getStartMessage(client: Client) {
		const channel = await client.channels.fetch(this.textChannelId);
		if (channel instanceof TextChannel) {
			return channel.messages.fetch(this.meetingMessageId);
		}
		return;
	}

	public createUtterance(receiver: VoiceReceiver, userId: string, client: Client) {
		const user = client.users.cache.get(userId);
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

	public secondsSinceStart(): number {
		return (Date.now() - this.startTime) / 1000;
	}

	private onRecordingEnd(utterance: Utterance): void {
		this.stoppedSpeaking(utterance.userId);
	}

	private async writeToTranscript(utterance: Utterance): Promise<void> {
		if (utterance.textContent) {
			await this.transcript.addUtterance(utterance);
		} else {
			return;
		}
	}

	private onTranscriptionComplete(utterance: Utterance): void {
		this.writeToTranscript(utterance);
	}

	public getConnection() {
		return getVoiceConnection(this.guildId);
	}

	public addSpeaking(userId: string): void {
		this.speaking.add(userId);
	}

	public stoppedSpeaking(userId: string): void {
		this.speaking.delete(userId);
	}

	public async addMember(userId: string) {
		const user = await createOrGetUser(this.prismaClient, { discordId: userId });
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
		this.members.add(userId);
	}

	public ignoreUser(userId: string): void {
		this.ignore.add(userId);
	}

	public stopIgnoring(userId: string): void {
		this.ignore.delete(userId);
	}

	public isSpeaking(userId: string): boolean {
		return this.speaking.has(userId);
	}

	public isMember(userId: string): boolean {
		return this.members.has(userId);
	}

	public isIgnored(userId: string): boolean {
		return this.ignore.has(userId);
	}

	public getTimestamp(): number {
		return this.startTime;
	}

	public userJoined(userId: string): void {
		this.addMember(userId);
	}
}
