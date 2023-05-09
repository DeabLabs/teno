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
	joinCall(voiceChannel.id, guildId);

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

		// Add meeting to Teno
		teno.addMeeting(newMeeting);

		// Play a sound to indicate that the bot has joined the channel
		// await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know. Ya dig?');
	} catch (e) {
		console.error(e);
	}
}

async function joinCall(guildId: string, channelId: string): Promise<void> {
	const url = 'https://voice-relay-staging.up.railway.app/join';
	const authToken = Config.VOICE_RELAY_AUTH_KEY;

	const body = {
		GuildID: guildId,
		ChannelID: channelId,
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Error joining voice channel: ${response.statusText}`);
	}
}
