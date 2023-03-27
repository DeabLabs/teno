import { getVoiceConnection } from '@discordjs/voice';
import { GatewayIntentBits } from 'discord-api-types/v10';
import { Interaction, Constants, Client, Message } from 'discord.js';
import { Config } from './config.js';
import { deploy } from './deploy.js';
import { interactionHandlers } from './interactions.js';
import { answerQuestionOnTranscript } from './langchain.js';
import type { Meeting } from './meeting.js';

const botToken = Config.get('TOKEN');

const client = new Client({
	intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds],
});

const { Events } = Constants;

const meetings: Meeting[] = [];

export function addMeeting(meeting: Meeting) {
	meetings.push(meeting);
}

client.on(Events.CLIENT_READY, () => console.log('Ready!'));

client.on(Events.CLIENT_READY, async () => {
	// Automatically deploy the commands to all guilds the bot is in
	for (const guild of client.guilds.cache.values()) {
		await deploy(guild);
	}
	// Uncomment the following line if you want to deploy the commands globally (this had to do with the !deploy command not working)
	// await deploy(client.guilds.cache.first());
});

/**
 * The IDs of the users that can be recorded by the bot.
 */
const recordable = new Set<string>();

client.on(Events.INTERACTION_CREATE, async (interaction: Interaction) => {
	if (!interaction.isCommand() || !interaction.guildId) return;

	const handler = interactionHandlers.get(interaction.commandName);

	try {
		if (handler) {
			await handler(interaction, recordable, client, getVoiceConnection(interaction.guildId));
		} else {
			await interaction.reply('Unknown command');
		}
	} catch (error) {
		console.warn(error);
	}
});

client.on('messageCreate', async (message: Message) => {
	// Create an array to store all your Meeting objects
	// You need to properly manage the array to add and remove Meeting objects as they are created and finished

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const targetMeeting = meetings.find((meeting) => meeting.getStartMessage().id === message.reference?.messageId);
	console.log('Target meeting', targetMeeting);

	if (targetMeeting) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const question = message.content;
		const transcriptFilePath = targetMeeting.getTranscriptFilePath();
		console.log('Transcription file path:', transcriptFilePath);

		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			console.log('Question: ', question);
			const answer = await answerQuestionOnTranscript(question, transcriptFilePath);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			console.log('Answer: ', answer);
			await message.reply(answer); // Send the answer as a reply to the question
		} catch (error) {
			console.error('Error answering question:', error);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			await message.reply('An error occurred while trying to answer your question. Please try again.');
		}
	}
});

client.on(Events.ERROR, console.warn);

void client.login(botToken);
