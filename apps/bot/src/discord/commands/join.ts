import type { CommandInteraction, VoiceBasedChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { TextChannel } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Meeting } from '@/models/meeting.js';
import type { RelayResponderConfig } from '@/services/relay.js';
import { subscribeToToolMessages } from '@/services/relay.js';
import { joinCall } from '@/services/relay.js';

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

		const speakingModeBool = teno.getSpeechOn();
		let speakingModeInt;
		if (speakingModeBool) {
			speakingModeInt = 3; // AutoSleep
		} else {
			speakingModeInt = 1; // NeverSpeak
		}

		const config: RelayResponderConfig = {
			BotName: 'Teno',
			Personality:
				'You are a friendly, interesting and knowledgeable discord conversation bot. Your responses are concise and to the point, but you can go into detail if a user asks you to.',
			SpeakingMode: speakingModeInt,
			LinesBeforeSleep: 4,
			BotNameConfidenceThreshold: 0.7,
			LLMService: 'openai',
			LLMModel: 'gpt-3.5-turbo',
			TranscriptContextSize: 20,
			Tools: [
				{
					name: 'TextChannelMessage',
					description: 'This tool allows you to send a message to a Discord text channel.',
					inputGuide: "The input is a string, which is the message you'd like to send to the channel.",
					outputGuide: 'This tool does not return any output.',
				},
			],
		};

		// Send join request to voice relay
		try {
			await joinCall(guildId, voiceChannel.id, transcriptKey, config);
		} catch (e) {
			console.error(e);
		}

		// Subscribe to tool messages
		try {
			const eventSource = subscribeToToolMessages(
				guildId,
				async (toolMessage) => {
					console.log('Received tool message:', toolMessage);
					// Add logic to handle tool message here

					// Invariant check that tool array is not empty
					invariant(toolMessage.length > 0);

					// Parse tool message json
					const toolMessageJson = JSON.parse(toolMessage);

					// Execute the first tool message
					if (toolMessageJson[0].name == 'TextChannelMessage') {
						const threadChannelId = newMeetingMessage.id;

						const threadChannel = await teno.getClient().channels.fetch(threadChannelId);

						invariant(threadChannel?.type == ChannelType.PublicThread);

						// Send message to text channel
						threadChannel.send(toolMessageJson[0].input);
					}
				},
				(error) => {
					console.error('Error received:', error);
					// Add logic to handle error here
				},
			);
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
