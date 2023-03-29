import type { Client, Guild, Interaction, Message } from 'discord.js';
import { Constants } from 'discord.js';
import type { RedisClient } from './bot.js';
import { interactionHandlers } from './interactions.js';
import { answerQuestionOnTranscript } from './langchain.js';
import type { Meeting } from './meeting.js';
import { playTextToSpeech } from './textToSpeech.js';

const { Events } = Constants;

export class Teno {
	id: string;
	client: Client;
	meetings: Meeting[] = [];
	guild: Guild;
	redisClient: RedisClient;

	constructor({ client, guild, redisClient }: { client: Client; guild: Guild; redisClient: RedisClient }) {
		this.client = client;
		this.guild = guild;
		this.id = guild.id;
		this.redisClient = redisClient;
		this.setupClient();
	}

	private setupClient() {
		// Command listener
		this.client.on(Events.INTERACTION_CREATE, async (interaction: Interaction) => {
			if (!interaction.isCommand() || !interaction.guildId || interaction.guildId != this.id) return;

			const handler = interactionHandlers.get(interaction.commandName);

			try {
				if (handler) {
					await handler(interaction, this);
				} else {
					await interaction.reply('Unknown command');
				}
			} catch (error) {
				console.warn(error);
			}
		});

		// meetingMessage reply listener
		this.client.on('messageCreate', async (message: Message) => {
			const targetMeeting = this.meetings.find((meeting) => meeting.id === message.reference?.messageId);

			if (targetMeeting) {
				const question = message.content;
				const transcript = targetMeeting.transcript;
				try {
					const transcriptText = await transcript.getTranscript();
					console.log('Question: ', question);
					const answer = await answerQuestionOnTranscript(question, transcriptText);
					console.log('Answer: ', answer);
					await message.reply(answer);
					await playTextToSpeech(targetMeeting.getConnection(), answer);
				} catch (error) {
					console.error('Error answering question:', error);
					await message.reply('An error occurred while trying to answer your question. Please try again.');
				}
			}
		});

		console.log(`Teno ${this.id} ready`);
	}

	public addMeeting(meeting: Meeting) {
		this.meetings.push(meeting);
	}
}
