import type { VoiceReceiver } from '@discordjs/voice';
import { getVoiceConnection } from '@discordjs/voice';
import type { Message, CommandInteraction, Client } from 'discord.js';
import { TextChannel } from 'discord.js';
import { GuildMember } from 'discord.js';
import type { RedisClient } from '../bot.js';
import { Transcript } from './transcript.js';
import { makeTranscriptKey } from '../utils/transcriptUtils.js';
import { Utterance } from './utterance.js';
import { number } from 'zod';

export class Meeting {
	public id: string;
	public initialized = false;
	public transcript: Transcript;
	private guildId: string;
	private textChannelId: string;
	private speaking: Set<string>;
	private members: Set<string>;
	private ignore: Set<string>;
	private startTime: number;

	public constructor({
		meetingMessageId,
		textChannelId,
		guildId,
		redisClient,
	}: {
		meetingMessageId: string;
		textChannelId: string;
		guildId: string;
		redisClient: RedisClient;
	}) {
		this.id = meetingMessageId;
		this.textChannelId = textChannelId;
		this.guildId = guildId;
		this.speaking = new Set<string>();
		this.members = new Set<string>();
		this.ignore = new Set<string>();
		this.startTime = Date.now();
		this.transcript = new Transcript(redisClient, makeTranscriptKey(guildId, textChannelId, meetingMessageId));
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
			return channel.messages.fetch(this.id);
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

	public addMember(userId: string): void {
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
