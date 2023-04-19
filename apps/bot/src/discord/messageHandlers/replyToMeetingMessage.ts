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
			const conversationHistory = await getMessageChain(message);

			// Check if any message in the conversation history is a meeting message
			for (const historyMessageId of conversationHistory) {
				const isTargetMeeting = await findMeetingByMeetingMessage(message.author.id, historyMessageId, teno);
				if (isTargetMeeting) {
					return true;
				}
			}

			return false;
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

		// Get the conversation history
		const conversationHistory = await getConversationHistory(message, targetMeetingMessageId);

		const transcriptLines = await transcript.getCleanedTranscript();

		const answerOutput = await answerQuestionOnTranscript(conversationHistory, transcriptLines);

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

async function getConversationHistory(message: Message, meetingMessageId: string): Promise<string[]> {
	const history: string[] = [];
	let currentMessage = message;

	while (currentMessage.reference?.messageId && currentMessage.reference.messageId !== meetingMessageId) {
		const parentMessage = await currentMessage.channel.messages.fetch(currentMessage.reference.messageId);
		const contentWithUsername = currentMessage.author.bot
			? parentMessage.content
			: `${currentMessage.author.username}: ${parentMessage.content}`;
		history.unshift(contentWithUsername);
		currentMessage = parentMessage;
	}

	return history;
}

async function getMessageChain(message: Message): Promise<string[]> {
	const history: string[] = [];
	let currentMessage = message;

	while (currentMessage.reference?.messageId) {
		const parentMessage = await currentMessage.channel.messages.fetch(currentMessage.reference.messageId);
		history.unshift(parentMessage.id);
		currentMessage = parentMessage;
	}

	return history;
}
