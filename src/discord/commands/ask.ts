import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import { answerQuestionOnTranscript, qaOnVectorstores } from '@/services/langchain.js';
import type { Teno } from '@/models/teno.js';

export const askCommand = createCommand(
	{
		name: 'ask',
		description: 'Ask Teno a question about the meeting you are in',
		options: [
			{
				name: 'question',
				description: 'The question you want to ask',
				required: true,
			},
		],
	},
	ask,
);

async function ask(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply();
	const member = interaction.member;
	if (member instanceof GuildMember && member.voice.channel) {
		const channel = member.voice.channel.id;
		const meeting = [...teno.getMeetings()]
			.sort(
				// Sort by most recent meeting
				(a, b) => b.getTimestamp() - a.getTimestamp(),
			)
			.find((meeting) => meeting.getVoiceChannelId() === channel && meeting.isAttendee(member.id));
		if (meeting) {
			const question = interaction.options.get('question')?.value;
			const transcript = meeting.getTranscript();
			try {
				const transcriptText = await transcript.getTranscript();
				if (!question && typeof question !== 'string') throw new Error('Question is undefined');
				console.log('Meeting ID: ', meeting.getId());
				// Question answering with vectorstores
				const collection = transcript.getCollection();
				if (collection) {
					const answer = await qaOnVectorstores(collection, transcriptText);
					await interaction.editReply(`Question: ${question}\nAnswer: ${answer}`);
				}

				// const answer = await answerQuestionOnTranscript(String(question), transcriptText);
				// await interaction.editReply(`Question: ${question}\nAnswer: ${answer}`);
			} catch (error) {
				console.error('Error answering question:', error);
				await interaction.editReply('An error occurred while trying to answer your question. Please try again.');
			}
		} else {
			await interaction.editReply('An error occurred while trying to answer your question. Please try again.');
		}
	} else {
		console.error('Could not get member from interaction');
		await interaction.editReply('You need to be in a meeting with Teno to use /ask');
	}
}
