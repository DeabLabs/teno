import { clearInterval } from 'timers';

import invariant from 'tiny-invariant';
import { usageQueries } from 'database';
import type { Message } from 'discord.js';

import type { Teno } from '@/models/teno.js';
import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createMessageHandler } from '@/discord/createMessageHandler.js';
import { Transcript } from '@/models/transcript.js';
import { pushToCache } from '@/services/relay.js';
import type { CacheItem } from '@/services/relay.js';

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

export const messageInMeetingThreadHandler = createMessageHandler(
	async (message, teno) => {
		try {
			const isTargetMeeting = await findMeetingByMeetingMessage(message.author.id, message.channelId, teno);
			if (isTargetMeeting) {
				return true;
			}

			return false;
		} catch (e) {
			return false;
		}
	},
	(message, teno) => {
		return messageInMeetingThread(message, teno); // Pass conversationHistory to the messageInMeetingThread function
	},
);

async function messageInMeetingThread(message: Message, teno: Teno) {
	try {
		const conversationHistory = await message.channel.messages.fetch({ limit: 10 });

		invariant(message);

		const targetMeetingMessageId = message.channelId; // Use the ID of the first message in the conversation history
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

		if (targetMeeting.active) {
			// Create a cache item for the message
			const cacheItem: CacheItem = {
				Type: 'TextChannelMessage',
				Permanent: true,
				Content: `${message.author.username}: ${message.content}`,
			};

			pushToCache(teno.id, cacheItem);
		}

		const conversationHistoryContent: string[] = [];

		conversationHistory.forEach((msg: Message<true> | Message<false>) => {
			if ('content' in msg && 'username' in msg.author) {
				conversationHistoryContent.unshift(`${msg.author.username}: ${msg.content}`);
			}
		});

		let transcriptLines = [''];

		try {
			if (transcript) {
				transcriptLines = await transcript.getCleanedTranscript();
			}
		} catch (e) {
			console.error(e);
		}

		const channel = message.channel;

		const sendTypingToChannel = async () => {
			await channel.sendTyping();
		};

		channel.sendTyping();
		const typingInterval = setInterval(sendTypingToChannel, 1000); // 10 seconds in milliseconds (since sendTyping lasts for 10 seconds)

		try {
			const answerOutput = await answerQuestionOnTranscript(conversationHistoryContent, transcriptLines, 'gpt-4');

			if (answerOutput.status === 'error') {
				throw new Error(answerOutput.error);
			}

			usageQueries.createUsageEvent(teno.getPrismaClient(), {
				discordUserId: message.author.id,
				discordGuildId: message.guild?.id || '',
				meetingId: targetMeeting.id,
				languageModel: answerOutput.languageModel,
				promptTokens: answerOutput.promptTokens,
				completionTokens: answerOutput.completionTokens,
			});

			channel.send(answerOutput.answer);
		} catch (err) {
			console.error(err);
		} finally {
			clearInterval(typingInterval); // stop typing regardless of success or error
		}
	} catch (error) {
		console.error('Error answering question:', error);
		await message.reply('An error occurred while trying to answer your question. Please try again.');
	}
}
