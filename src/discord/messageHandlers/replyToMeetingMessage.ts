import type { Message } from 'discord.js';

import type { Teno } from '@/models/teno.js';
import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createMessageHandler } from '@/discord/createMessageHandler.js';

export const replyToMeetingMessageHandler = createMessageHandler(
	(message, teno) => {
		const isTargetMeeting = teno
			.getMeetings()
			.find((meeting) => meeting.getMeetingMessageId() === message.reference?.messageId);
		return Boolean(isTargetMeeting);
	},
	(message, teno) => {
		replyToMeetingMessage(message, teno);
	},
);

async function replyToMeetingMessage(message: Message, teno: Teno) {
	const targetMeeting = teno
		.getMeetings()
		.find((meeting) => meeting.getMeetingMessageId() === message.reference?.messageId);

	if (targetMeeting) {
		const loadingMessage = await message.reply('One sec...');
		const question = message.content;
		const transcript = targetMeeting.getTranscript();
		try {
			const transcriptLines = await transcript.getTranscriptRaw();
			console.log('Question: ', question);
			const answer = await answerQuestionOnTranscript(question, transcriptLines);
			console.log('Answer: ', answer);
			await message.reply(answer);
		} catch (error) {
			console.error('Error answering question:', error);
			await message.reply('An error occurred while trying to answer your question. Please try again.');
		}
		loadingMessage.delete();
	}
}
