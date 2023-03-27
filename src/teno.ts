import type { Client, Guild, Interaction, Message } from 'discord.js';
import { Constants } from 'discord.js';
import { interactionHandlers } from './interactions.js';
import { answerQuestionOnTranscript } from './langchain.js';
import type { Meeting } from './meeting.js';

const { Events } = Constants;

export class Teno {
	id: string;
	client: Client;
	meetings: Meeting[] = [];
	guild: Guild;

	constructor({ client, guild }: { client: Client; guild: Guild }) {
		this.client = client;
		this.guild = guild;
		this.id = guild.id;
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
				const transcriptFilePath = targetMeeting.transcriptFilePath;
				try {
					console.log('Question: ', question);
					const answer = await answerQuestionOnTranscript(question, transcriptFilePath);
					console.log('Answer: ', answer);
					await message.reply(answer);
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
