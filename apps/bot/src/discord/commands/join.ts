import type { CommandInteraction, VoiceBasedChannel } from 'discord.js';
import type { TextChannel } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Meeting } from '@/models/meeting.js';
import { DEFAULT_CONFIG } from '@/services/relaySDK.js';

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
		const relayClient = teno.getRelayClient();

		const newMeeting = await Meeting.load({
			meetingMessageId: newMeetingMessage.id,
			voiceChannelId: voiceChannel.id,
			guildId: guildId,
			redisClient: teno.getRedisClient(),
			prismaClient: teno.getPrismaClient(),
			voiceRelayClient: relayClient,
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

		// const speakingModeBool = teno.getSpeechOn();
		// let speakingMode;
		// if (speakingModeBool) {
		// 	speakingMode = 'AutoSleep';
		// } else {
		// 	speakingMode = 'NeverSpeak';
		// }

		const threadChannel = (await teno.getClient().channels.fetch(newMeetingMessage.id)) as TextChannel;

		// Send join request to voice relay
		try {
			await relayClient.joinCall(voiceChannel.id, transcriptKey, DEFAULT_CONFIG);

			// await relayClient.syncUserResponseChannel(threadChannel, 'Get the answer to the question');

			// await relayClient.syncToolChannel(threadChannel, {
			// 	toolName: 'Weather',
			// 	toolDescription: 'Get the current weather in a city',
			// 	toolInputGuide: 'Input the city you want to get the weather for.',
			// 	toolOutputGuide: 'The weather will be in the response document',
			// });

			await relayClient.syncTextChannel(threadChannel, 10, true);

			// const getLetterCountParity: (str: string) => Promise<string> = async (str: string) => {
			// 	const letterCount = str.replace(/[^A-Za-z]/g, '').length; // Only count alphabetic characters
			// 	if (letterCount % 2 === 0) {
			// 		return 'good';
			// 	} else {
			// 		return 'bad';
			// 	}
			// };

			// await relayClient.addToolWithHandler({
			// 	toolName: 'CheckString',
			// 	toolDescription: 'Use this to check a string',
			// 	toolInputGuide: 'Input string to check',
			// 	toolOutputGuide: 'Result will be good or bad, in the response document',
			// 	handler: getLetterCountParity,
			// });

			// await relayClient.addToolWithHandler({
			// 	toolName: 'CreateGoogleDoc',
			// 	toolDescription: 'Create a google doc',
			// 	toolInputGuide: 'Input the content of the google doc',
			// 	toolOutputGuide: 'This tool has no output',
			// 	handler: async (content: string) => {
			// 		const url = 'https://api.furl.ai/nreesegolden-281663/webhooks/31db4d67-6caa-423c-a941-a062516a61b8/execute';

			// 		const body = {
			// 			name: `run`,
			// 			inputs: {
			// 				content,
			// 				email: `nreesegolden@gmail.com`,
			// 			},
			// 		};

			// 		const options: RequestInit = {
			// 			method: 'POST',
			// 			headers: {
			// 				'Content-Type': 'application/json',
			// 				Accept: 'application/json',
			// 			},
			// 			body: JSON.stringify(body),
			// 		};

			// 		const response = await fetch(url, options);
			// 		if (!response.ok) {
			// 			throw new Error(`HTTP error! status: ${response.status}`);
			// 		}
			// 	},
			// });

			// await relayClient.getUserInput('FavoriteColor', "One of the user's favorite color");
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
