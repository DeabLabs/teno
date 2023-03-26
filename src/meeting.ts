/* eslint-disable @typescript-eslint/prefer-readonly */
import type { VoiceBasedChannel, TextChannel, Message } from 'discord.js';
// import { writeUserJoined } from './transcripts';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Meeting {
	private speaking: Set<string>;
	private members: Set<string>;
	private ignore: Set<string>;
	private startTime: Date;
	private voiceChannel: VoiceBasedChannel;
	private meetingStartMessage!: Message;
	private transcriptFilePath: string;

	public constructor(
		textChannel: TextChannel,
		voiceChannel: VoiceBasedChannel,
		startMessage: Message,
		transcriptFilePath: string,
	) {
		this.speaking = new Set<string>();
		this.members = new Set<string>();
		this.ignore = new Set<string>();
		this.startTime = new Date();
		this.voiceChannel = voiceChannel;
		this.meetingStartMessage = startMessage;
		this.transcriptFilePath = transcriptFilePath;
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

	public getTimestamp(): Date {
		return this.startTime;
	}

	public userJoined(userId: string): void {
		this.addMember(userId);
		// writeUserJoined(userId);
	}

	public timeSinceStart(): string {
		const currentTime = new Date();
		const timeDiff = currentTime.getTime() - this.startTime.getTime();
		const hours = Math.floor(timeDiff / (1000 * 60 * 60));
		const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

		return `${hours} hours and ${minutes} minutes`;
	}
}
