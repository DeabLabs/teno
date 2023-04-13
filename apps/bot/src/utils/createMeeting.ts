import type { VoiceConnection } from '@discordjs/voice';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import type { VoiceBasedChannel, TextChannel } from 'discord.js';
import invariant from 'tiny-invariant';

import { Meeting } from '@/models/meeting.js';
import type { Teno } from '@/models/teno.js';

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
	const connection = joinVoiceChannel({
		channelId: voiceChannel.id,
		guildId: guildId,
		selfDeaf: false,
		selfMute: false,
		adapterCreator: voiceChannel.guild.voiceAdapterCreator,
	});

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
			active: true,
		});
		invariant(newMeeting);

		for (const [, member] of voiceChannel.members) {
			await newMeeting.addMember(member.id);
		}

		// Add meeting to Teno
		teno.addMeeting(newMeeting);

		// Play a sound to indicate that the bot has joined the channel
		// await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know. Ya dig?');

		// Start listening
		return startListening({
			connection,
			meeting: newMeeting,
			onError: async () =>
				await textChannel.send('Failed to join voice channel within 20 seconds, please try again later!'),
		});
	} catch (e) {
		console.error(e);
	}
}

async function startListening({
	connection,
	meeting,
	onError,
}: {
	connection: VoiceConnection;
	meeting: Meeting;
	onError?: (error: Error) => void;
}) {
	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 20e3);
		// https://discordjs.guide/voice/voice-connections.html#handling-disconnects
		connection.on(VoiceConnectionStatus.Disconnected, async () => {
			if (!connection) return;

			try {
				console.log('Disconnected! Attempting to reconnect...');
				await Promise.race([
					entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
					entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
				]);
				console.log('Reconnected!');
				// Seems to be reconnecting to a new channel - ignore disconnect
			} catch (error) {
				console.warn('Failed to reconnect, destroying connection');
				// Seems to be a real disconnect which SHOULDN'T be recovered from
				connection.destroy();
			}
		});

		const receiver = connection.receiver;

		receiver.speaking.on('start', async (userId) => {
			if (!meeting.isSpeaking(userId)) {
				meeting.addSpeaking(userId);
				meeting.addMember(userId);
				meeting.createUtterance(receiver, userId);
			}
		});
	} catch (error) {
		onError?.(error as Error);
	}
}
