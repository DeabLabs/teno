import type { Message } from 'discord.js';
import { MessageType } from 'discord.js';
import invariant from 'tiny-invariant';

import type { Teno } from '@/models/teno.js';
import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createMessageHandler } from '@/discord/createMessageHandler.js';
import { Transcript } from '@/models/transcript.js';

const findMeetingByMeetingMessage = async (messageId: string | undefined | null, teno: Teno) => {
	try {
		const targetMeetingMessageId = messageId;
		invariant(targetMeetingMessageId);

		const targetMeeting = await teno.getPrismaClient().meeting.findFirst({
			where: {
				meetingMessageId: targetMeetingMessageId,
			},
			include: {
				transcript: true,
			},
		});

		return targetMeeting;
	} catch (e) {
		return null;
	}
};

export const replyToMeetingMessageHandler = createMessageHandler(
	async (message, teno) => {
		try {
			invariant(message.reference?.messageId);
			const repliedMessage = await message.channel.messages.fetch(message.reference?.messageId);
			invariant(repliedMessage.author.id === teno.getClient().user?.id);
			console.log('Checking in db if message is a reply to a meeting message...');
			const isTargetMeeting = await findMeetingByMeetingMessage(message.reference?.messageId, teno);
			return Boolean(isTargetMeeting);
		} catch (e) {
			return false;
		}
	},
	(message, teno) => {
		return replyToMeetingMessage(message, teno);
	},
);

async function replyToMeetingMessage(message: Message, teno: Teno) {
	try {
		console.log('Replying to meeting message...');
		const loadingMessage = await message.reply('One sec...');

		const targetMeetingMessageId = message.reference?.messageId;
		const targetMeeting = await findMeetingByMeetingMessage(targetMeetingMessageId, teno);

		invariant(targetMeeting);
		invariant(targetMeeting.transcript);

		const question = message.content;
		const transcript = await Transcript.load({
			meetingId: targetMeeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey: targetMeeting.transcript.redisKey,
		});
		invariant(transcript);

		const transcriptLines = await transcript.getCleanedTranscript();
		console.log('Question: ', question);
		const answer = await answerQuestionOnTranscript(question, transcriptLines);
		console.log('Answer: ', answer);
		await loadingMessage.edit(answer);
	} catch (error) {
		console.error('Error answering question:', error);
		await message.reply('An error occurred while trying to answer your question. Please try again.');
	}
}
