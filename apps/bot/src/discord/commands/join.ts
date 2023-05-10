import type { CommandInteraction, TextChannel, VoiceBasedChannel } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Meeting } from '@/models/meeting.js';
import { Config } from '@/config.js';

export const joinCommand = createCommand({
	commandArgs: { name: 'join', description: 'Join a voice channel and start a meeting' },
	handler: join,
});

export type RelayResponderConfig = {
	BotName?: string;
	SleepMode?: number;
	LinesBeforeSleep?: number;
	BotNameConfidenceThreshold?: number;
	LLMService?: string;
	LLMModel?: string;
	TranscriptContextSize?: number;
	IgnoreUser?: string;
	IncludeUser?: string;
};

async function join(interaction: CommandInteraction, teno: Teno) {
	const guildId = interaction.guildId;
	const member = interaction.member;
	try {
		await interaction.deferReply();
		invariant(member instanceof GuildMember);
		invariant(guildId);
	} catch {
		await interaction.followUp({ content: 'Error joining voice channel' });
		return;
	}

	try {
		invariant(member.voice.channel, 'Join a voice channel and then try that again!');

		try {
			await interaction.deleteReply();
			await createMeeting({
				voiceChannel: member.voice.channel,
				guildId,
				textChannel: interaction.channel as TextChannel,
				teno,
				userDiscordId: interaction.user.id,
			});
		} catch (error) {
			console.error('Error while joining voice channel', error);
			await interaction.followUp({
				content: 'I am having trouble starting a meeting. Please try again in a little bit!',
			});
		}
	} catch (error) {
		if (error instanceof Error) {
			await interaction.followUp({ content: error.message.replace('Invariant failed:', '') });
		} else {
			await interaction.followUp({ content: 'Error joining voice channel' });
		}
	}
}

export async function createMeeting({
	voiceChannel,
	guildId,
	textChannel,
	teno,
	userDiscordId,
}: {
	teno: Teno;
	guildId: string;
	voiceChannel: VoiceBasedChannel;
	textChannel: TextChannel;
	userDiscordId: string;
}) {
	const newMeetingMessage = await Meeting.sendMeetingMessage({ voiceChannel, textChannel });
	if (!newMeetingMessage) {
		throw new Error('I am having trouble starting a meeting. Please try again in a little bit!');
	}

	try {
		const newMeeting = await Meeting.load({
			meetingMessageId: newMeetingMessage.id,
			voiceChannelId: voiceChannel.id,
			guildId: guildId,
			redisClient: teno.getRedisClient(),
			prismaClient: teno.getPrismaClient(),
			userDiscordId,
			client: teno.getClient(),
			teno: teno,
			active: true,
			authorDiscordId: userDiscordId,
		});
		invariant(newMeeting);

		for (const [, member] of voiceChannel.members) {
			await newMeeting.addMember(member.id, member.user.username, member.user.discriminator);
		}

		const transcriptKey = newMeeting.getTranscript().getTranscriptKey();

		const config: RelayResponderConfig = {
			BotName: 'Teno',
			SleepMode: 1, // 0 = AlwaysSleep, 1 = AutoSleep, 2 = NeverSleep
			LinesBeforeSleep: 4,
			BotNameConfidenceThreshold: 0.7,
			LLMService: 'openai',
			LLMModel: 'gpt-3.5-turbo',
			TranscriptContextSize: 20,
		};

		// Send join request to voice relay
		try {
			await joinCall(guildId, voiceChannel.id, transcriptKey, config);
		} catch (e) {
			console.error(e);
		}

		// Add meeting to Teno
		teno.addMeeting(newMeeting);

		// Play a sound to indicate that the bot has joined the channel
		// await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know. Ya dig?');
	} catch (e) {
		console.error(e);
	}
}

async function joinCall(
	guildId: string,
	channelId: string,
	transcriptKey: string,
	config: RelayResponderConfig,
): Promise<void> {
	const url = `${Config.VOICE_RELAY_URL}/join`;
	const authToken = Config.VOICE_RELAY_AUTH_KEY;

	const body = {
		GuildID: guildId,
		ChannelID: channelId,
		RedisTranscriptKey: transcriptKey,
		ResponderConfig: config,
	};

	console.log('Voice channel id: ' + channelId);
	console.log('Guild id: ' + guildId);

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify(body),
	});
	console.log(await response.text());

	if (!response.ok) {
		throw new Error(`Error joining voice channel: ${response.statusText}`);
	}
}
