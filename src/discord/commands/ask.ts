import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';

import { createCommand } from '@/discord/createCommand.js';
import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { playTextToSpeech } from '@/services/textToSpeech.js';
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
		const meeting = [...teno.meetings]
			.sort(
				// Sort by most recent meeting
				(a, b) => b.getTimestamp() - a.getTimestamp(),
			)
			.find((meeting) => meeting.voiceChannelId === channel && meeting.members.has(member.id));
		if (meeting) {
			const question = interaction.options.getString('question');
			const transcript = meeting.transcript;
			try {
				const transcriptText = await transcript.getTranscript();
				console.log('Question: ', question);
				if (!question) throw new Error('Question is undefined');
				const answer = await answerQuestionOnTranscript(question, transcriptText);
				console.log('Answer: ', answer);
				await interaction.editReply(`Question: ${question}\nAnswer: ${answer}`);
				playTextToSpeech(meeting.getConnection(), answer);
			} catch (error) {
				console.error('Error answering question:', error);
				await interaction.editReply('An error occurred while trying to answer your question. Please try again.');
			}
		} else {
			await interaction.editReply('Teno needs to be in a meeting with you to use /ask');
		}
	} else {
		console.error('Could not get member from interaction');
		await interaction.editReply('You need to be in a meeting with Teno to use /ask');
	}
}
