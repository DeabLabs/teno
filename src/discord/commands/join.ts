import type { VoiceConnection } from '@discordjs/voice';
import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { Client, CommandInteraction, Snowflake } from 'discord.js';
import { GuildMember } from 'discord.js';
import { Meeting } from '../../models/meeting.js';
import type { Teno } from '../../models/teno.js';
import { playTextToSpeech } from '../../services/textToSpeech.js';
import { createCommand } from '../createCommand.js';

export const joinCommand = createCommand(
	{ name: 'join', description: 'Join a voice channel and start a meeting' },
	join,
);

async function join(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply();
	let connection = getVoiceConnection(interaction.guildId as Snowflake);

	if (!connection) {
		if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
			const channel = interaction.member.voice.channel;
			connection = joinVoiceChannel({
				channelId: channel.id,
				guildId: channel.guild.id,
				selfDeaf: false,
				selfMute: false,
				// @ts-expect-error Currently voice is built in mind with API v10 whereas discord.js v13 uses API v9.
				adapterCreator: channel.guild.voiceAdapterCreator,
			});

			const newMeetingMessage = await Meeting.sendMeetingMessage(interaction);
			if (!newMeetingMessage) {
				await interaction.followUp('Could not send meeting message');
				return;
			}

			const newMeeting = new Meeting({
				meetingMessageId: newMeetingMessage.id,
				textChannelId: interaction.channelId,
				voiceChannelId: channel.id,
				guildId: interaction.guildId as Snowflake,
				redisClient: teno.redisClient,
			});
			channel.members.forEach((member) => {
				newMeeting.addMember(member.id);
			});

			// Add meeting to Teno
			teno.addMeeting(newMeeting);

			// Play a sound to indicate that the bot has joined the channel
			await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know. Ya dig?');

			// Start listening
			startListening({ connection, meeting: newMeeting, interaction, client: teno.client });
		} else {
			await interaction.followUp('Join a voice channel and then try that again!');
			return;
		}
	}
}

async function startListening({
	connection,
	meeting,
	interaction,
	client,
}: {
	connection: VoiceConnection;
	meeting: Meeting;
	interaction: CommandInteraction;
	client: Client;
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

		connection.on(VoiceConnectionStatus.Signalling, () => {
			connection.configureNetworking();
		});

		const receiver = connection.receiver;

		receiver.speaking.on('start', async (userId) => {
			if (!meeting.isSpeaking(userId)) {
				meeting.addSpeaking(userId);
				meeting.addMember(userId);
				meeting.createUtterance(receiver, userId, client);
			}
		});
	} catch (error) {
		console.warn(error);
		await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
	}
}
