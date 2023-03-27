import type { VoiceConnection } from '@discordjs/voice';
import { getVoiceConnection } from '@discordjs/voice';
import { entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { Client, CommandInteraction, Snowflake } from 'discord.js';
import { GuildMember } from 'discord.js';
import { Meeting } from './meeting.js';
import { createListeningStream } from './recorder.js';
import type { Teno } from './teno.js';
import { playTextToSpeech } from './textToSpeech.js';
import { createFile } from './transcriber.js';

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
				guildId: interaction.guildId as Snowflake,
			});

			// Create transcipt file
			await createFile(newMeeting.transcriptFilePath);
			// Add meeting to Teno
			teno.addMeeting(newMeeting);

			// Play a sound to indicate that the bot has joined the channel
			await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know, ya dig?');

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

		const receiver = connection.receiver;

		receiver.speaking.on('start', (userId) => {
			if (!meeting.isSpeaking(userId)) {
				meeting.addSpeaking(userId);
				createListeningStream(receiver, userId, meeting, client.users.cache.get(userId));
			}
		});
	} catch (error) {
		console.warn(error);
		await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
	}
}

async function leave(interaction: CommandInteraction) {
	const connection = getVoiceConnection(interaction.guildId as Snowflake);
	if (connection) {
		connection.destroy();
		await interaction.reply({ ephemeral: true, content: 'Left the channel!' });
	} else {
		await interaction.reply({ ephemeral: true, content: 'Not playing in this server!' });
	}
}

export const interactionHandlers = new Map<string, (interaction: CommandInteraction, teno: Teno) => Promise<void>>();

interactionHandlers.set('join', join);
interactionHandlers.set('leave', leave);
