import type { VoiceConnection, VoiceReceiver } from '@discordjs/voice';
import { entersState, VoiceConnectionStatus } from '@discordjs/voice';
import type { VoiceBasedChannel, TextChannel, User } from 'discord.js';
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
	} catch (e) {
		console.error(e);
	}
}

export async function startListening({
	voiceChannel,
	connection,
	onError,
	onVoiceReceiver,
}: {
	connection: VoiceConnection;
	voiceChannel: VoiceBasedChannel;
	onError?: (error: Error) => void;
	onVoiceReceiver: (payload: { user: User; receiver: VoiceReceiver }) => void;
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
			const user = await voiceChannel.client.users.fetch(userId);
			onVoiceReceiver?.({ user, receiver });
		});
	} catch (error) {
		onError?.(error as Error);
	}
}
