import { entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { Client, CommandInteraction, GuildMember, Snowflake, TextChannel, Message } from 'discord.js';
import { Meeting } from './meeting.js';
import { createListeningStream } from './recorder';
import { createFile } from './transcriber';

async function join(
	interaction: CommandInteraction,
	recordable: Set<Snowflake>,
	client: Client,
	connection?: VoiceConnection,
) {
	await interaction.deferReply();
	if (!connection) {
		if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
			const channel = interaction.member.voice.channel;
			connection = joinVoiceChannel({
				channelId: channel.id,
				guildId: channel.guild.id,
				selfDeaf: false,
				selfMute: true,
				// @ts-expect-error Currently voice is built in mind with API v10 whereas discord.js v13 uses API v9.
				adapterCreator: channel.guild.voiceAdapterCreator,
			});
			// Add all members in the channel to the recordable set
			channel.members.forEach((member) => {
				recordable.add(member.id);
			});

			// Create transcipt file
			const transcriptFilePath = createFile(channel.id);
			const startMessage = (await interaction.followUp(
				`Teno started listening to a meeting in the voice channel "${channel.name}". Reply to this message to ask Teno about it!`,
			)) as Message;
			// Create a new Meeting object
			const textChannel = interaction.channel as TextChannel;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-call
			const meeting = new Meeting(textChannel, channel, startMessage, transcriptFilePath);
		} else {
			await interaction.followUp('Join a voice channel and then try that again!');
			return;
		}
	}

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 20e3);
		const receiver = connection.receiver;

		receiver.speaking.on('start', (userId) => {
			if (recordable.has(userId)) {
				createListeningStream(receiver, userId, client.users.cache.get(userId));
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
// interactionHandlers.set('record', record);
interactionHandlers.set('leave', leave);
