import type { Message } from 'discord.js';
import type { Teno } from '../../models/teno.js';
import { answerQuestionOnTranscript } from '../../services/langchain.js';
import { playTextToSpeech } from '../../services/textToSpeech.js';
import { createMessageHandler } from '../createMessageHandler.js';

export const replyToMeetingMessageHandler = createMessageHandler(
	(message, teno) => {
		const isTargetMeeting = teno.meetings.find((meeting) => meeting.id === message.reference?.messageId);
		return Boolean(isTargetMeeting);
	},
	(message, teno) => {
		replyToMeetingMessage(message, teno);
	},
);

async function replyToMeetingMessage(message: Message, teno: Teno) {
	const targetMeeting = teno.meetings.find((meeting) => meeting.id === message.reference?.messageId);

	if (targetMeeting) {
		const loadingMessage = await message.reply('One sec...');
		const question = message.content;
		const transcript = targetMeeting.transcript;
		try {
			const transcriptText = await transcript.getTranscript();
			console.log('Question: ', question);
			const answer = await answerQuestionOnTranscript(question, transcriptText);
			console.log('Answer: ', answer);
			await message.reply(answer);
			playTextToSpeech(targetMeeting.getConnection(), answer);
		} catch (error) {
			console.error('Error answering question:', error);
			await message.reply('An error occurred while trying to answer your question. Please try again.');
		}
		loadingMessage.delete();
	}
}
