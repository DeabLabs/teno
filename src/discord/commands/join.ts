import type { VoiceConnection } from '@discordjs/voice';
import { VoiceConnectionStatus, entersState, getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import type { CommandInteraction, Snowflake } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { Meeting } from '@/models/meeting.js';
import type { Teno } from '@/models/teno.js';
import { createCommand } from '@/discord/createCommand.js';

export const joinCommand = createCommand({
	commandArgs: { name: 'join', description: 'Join a voice channel and start a meeting' },
	handler: join,
});

async function join(interaction: CommandInteraction, teno: Teno) {
	try {
		await interaction.deferReply();
		// let connection = getVoiceConnection(interaction.guildId as Snowflake);
		invariant(interaction.member instanceof GuildMember);
		invariant(interaction.guildId);
		let connection = getVoiceConnection(interaction.guildId);
		if (!connection) {
			if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
				const channel = interaction.member.voice.channel;
				connection = joinVoiceChannel({
					channelId: channel.id,
					guildId: channel.guild.id,
					selfDeaf: false,
					selfMute: false,
					adapterCreator: channel.guild.voiceAdapterCreator,
				});

				const newMeetingMessage = await Meeting.sendMeetingMessage(interaction);
				if (!newMeetingMessage) {
					await interaction.followUp({
						content: 'I am having trouble starting a meeting. Please try again in a little bit!',
					});
					return;
				}

				try {
					const newMeeting = await Meeting.load({
						meetingMessageId: newMeetingMessage.id,
						textChannelId: interaction.channelId,
						voiceChannelId: channel.id,
						guildId: interaction.guildId as Snowflake,
						redisClient: teno.getRedisClient(),
						prismaClient: teno.getPrismaClient(),
						userDiscordId: interaction.user.id,
						client: teno.getClient(),
						active: true,
					});
					invariant(newMeeting);

					for (const [, member] of channel.members) {
						await newMeeting.addMember(member.id);
					}

					// Add meeting to Teno
					teno.addMeeting(newMeeting);

					// Play a sound to indicate that the bot has joined the channel
					// await playTextToSpeech(connection, 'Ayyy wazzup its ya boi Teno! You need anything you let me know. Ya dig?');

					// Start listening
					startListening({ connection, meeting: newMeeting, interaction });
				} catch (e) {
					console.error('Error while joining voice channel', e);
					await interaction.followUp({
						content: 'I am having trouble starting a meeting. Please try again in a little bit!',
					});
					return;
				}
			} else {
				await interaction.followUp({ content: 'Join a voice channel and then try that again!' });
				return;
			}
		} else {
			await interaction.followUp({ content: 'I am already in a voice channel!' });
			return;
		}
	} catch (e) {
		await interaction.followUp({ content: 'Error joining voice channel' });
	}
}

async function startListening({
	connection,
	meeting,
	interaction,
}: {
	connection: VoiceConnection;
	meeting: Meeting;
	interaction: CommandInteraction;
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
		console.warn(error);
		await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
	}
}
