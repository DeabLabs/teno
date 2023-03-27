import type { VoiceConnection } from '@discordjs/voice';
import { entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { Client, CommandInteraction, Snowflake, TextChannel, Message } from 'discord.js';
import { GuildMember } from 'discord.js';
import { addMeeting } from './bot.js';
import { Meeting } from './meeting.js';
import { createListeningStream } from './recorder.js';
import { playTextToSpeech } from './textToSpeech.js';
import { createFile } from './transcriber.js';

async function join(
	interaction: CommandInteraction,
	recordable: Set<Snowflake>,
	client: Client,
	connection?: VoiceConnection,
) {
	let meeting: Meeting;
	await interaction.deferReply();
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
			// Add all members in the channel to the recordable set
			channel.members.forEach((member) => {
				recordable.add(member.id);
			});

			// Create transcipt file
			const transcriptFilePath = await createFile(channel.id);
			const startMessage = (await interaction.followUp(
				`Teno is listening to a meeting in ${channel.name}. Reply to this message to ask Teno about it!`,
			)) as Message;
			console.log('Start message id: ', startMessage.id);
			const textChannel = interaction.channel as TextChannel;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-call
			meeting = new Meeting(textChannel, channel, startMessage, transcriptFilePath);
			addMeeting(meeting);

			// Play a sound to indicate that the bot has joined the channel
			await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know, ya dig?');
		} else {
			await interaction.followUp('Join a voice channel and then try that again!');
			return;
		}
	}

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
				if (recordable.has(userId)) {
					meeting.addSpeaking(userId);
					createListeningStream(receiver, userId, meeting, client.users.cache.get(userId));
				}
			}
		});
	} catch (error) {
		console.warn(error);
		await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
	}
}

async function leave(
	interaction: CommandInteraction,
	recordable: Set<Snowflake>,
	_client: Client,
	connection?: VoiceConnection,
) {
	if (connection) {
		connection.destroy();
		recordable.clear();
		await interaction.reply({ ephemeral: true, content: 'Left the channel!' });
	} else {
		await interaction.reply({ ephemeral: true, content: 'Not playing in this server!' });
	}
}

export const interactionHandlers = new Map<
	string,
	(
		interaction: CommandInteraction,
		recordable: Set<Snowflake>,
		client: Client,
		connection?: VoiceConnection,
	) => Promise<void>
>();

interactionHandlers.set('join', join);
interactionHandlers.set('leave', leave);
