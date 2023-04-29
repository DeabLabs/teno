import type { Message } from 'discord.js';
import invariant from 'tiny-invariant';
import { usageQueries } from 'database';

import type { Teno } from '@/models/teno.js';
import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createMessageHandler } from '@/discord/createMessageHandler.js';
import { Transcript } from '@/models/transcript.js';

const findMeetingByMeetingMessage = async (discordUserId: string, messageId: string | undefined | null, teno: Teno) => {
	try {
		const targetMeetingMessageId = messageId;
		invariant(targetMeetingMessageId);

		const targetMeeting = await teno.getPrismaClient().meeting.findFirst({
			where: {
				meetingMessageId: targetMeetingMessageId,
				OR: [
					{
						attendees: {
							some: {
								discordId: discordUserId,
							},
						},
					},
					{ locked: false },
				],
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
			invariant(
				repliedMessage.author.id === teno.getClient().user?.id && message.author.id !== teno.getClient().user?.id,
			);

			// Get the conversation history
			const conversationHistory = await getConversationHistory(message);

			const firstHistoryMessage = conversationHistory[0];
			invariant(firstHistoryMessage);
			console.log('First history message: ', firstHistoryMessage.content);
			const isTargetMeeting = await findMeetingByMeetingMessage(message.author.id, firstHistoryMessage.id, teno);
			if (isTargetMeeting) {
				return true;
			}

			return false;
		} catch (e) {
			return false;
		}
	},
	(message, teno) => {
		return replyToMeetingMessage(message, teno); // Pass conversationHistory to the replyToMeetingMessage function
	},
);

async function replyToMeetingMessage(message: Message, teno: Teno) {
	try {
		const conversationHistory = await getConversationHistory(message); // Get the conversation history

		const meetingMessage = conversationHistory[0]; // Get the first message in the conversation history

		invariant(message);
		invariant(meetingMessage);

		console.log('Replying to meeting message...');
		const loadingMessage = await message.reply('One sec...');

		const targetMeetingMessageId = meetingMessage.id; // Use the ID of the first message in the conversation history
		const targetMeeting = await findMeetingByMeetingMessage(message.author.id, targetMeetingMessageId, teno);

		invariant(targetMeetingMessageId);
		invariant(targetMeeting);
		invariant(targetMeeting.transcript);

		const transcript = await Transcript.load({
			meetingId: targetMeeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey: targetMeeting.transcript.redisKey,
		});
		invariant(transcript);

		const conversationHistoryContent = conversationHistory.map((msg) =>
			msg.author.bot ? msg.content : `${msg.author.username}: ${msg.content}`,
		);

		const transcriptLines = await transcript.getCleanedTranscript();

		console.log('Conversation history:', conversationHistoryContent);

		const answerOutput = await answerQuestionOnTranscript(
			conversationHistoryContent.slice(1),
			transcriptLines,
			'gpt-4',
		);

		if (answerOutput.status === 'error') {
			throw new Error(answerOutput.error);
		}

		console.log('Answer: ', answerOutput.answer);
		await loadingMessage.edit(answerOutput.answer);

		usageQueries.createUsageEvent(teno.getPrismaClient(), {
			discordUserId: message.author.id,
			discordGuildId: message.guild?.id || '',
			meetingId: targetMeeting.id,
			languageModel: answerOutput.languageModel,
			promptTokens: answerOutput.promptTokens,
			completionTokens: answerOutput.completionTokens,
		});
	} catch (error) {
		console.error('Error answering question:', error);
		await message.reply('An error occurred while trying to answer your question. Please try again.');
	}
}

async function getConversationHistory(message: Message): Promise<Message[]> {
	const conversationHistory = await getParentMessage(message);
	return conversationHistory;
}

async function getParentMessage(message: Message, history: Message[] = []): Promise<Message[]> {
	history.unshift(message);

	if (!message.reference || !message.reference.messageId) {
		return history;
	}

	const parentMessage = await message.channel.messages.fetch(message.reference.messageId);
	return await getParentMessage(parentMessage, history);
}
