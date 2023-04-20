import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';
import { usageQueries } from 'database';
import { getVoiceConnection } from '@discordjs/voice';

import { chimeInOnTranscript } from '@/services/langchain.js';
import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';
import { Utterance } from '@/models/utterance.js';
import { playTextToSpeech } from '@/services/textToSpeech.js';

export const chimeInCommand = createCommand({
	commandArgs: {
		name: 'chime-in',
		description: `Teno will publicly give its opinion the most recent question or topic.`,
	},
	handler: chimeIn,
});

const thinkingTextVariations = [
	'Hmmm, give me a second to think about that...',
	'Hold on, let me ponder on that for a moment...',
	'Wait a sec, I need to contemplate that...',
	'Allow me a moment to mull over that...',
	'One moment, just thinking about that...',
	'Hold up, let me process that for a bit...',
	"Just a second, I'm reflecting on that...",
	'Bear with me, I need to consider that...',
	"Wait a moment, I'm weighing that in my mind...",
	'Let me think that through for a moment...',
] as const;

async function sleep(timeMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, timeMs));
}

async function chimeIn(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply();
	await sleep(1000);

	const guildId = interaction.guildId;
	const member = interaction.member;
	const tenoId = teno.getClient().user?.id;
	const voiceConfig = await teno.getVoiceService();

	try {
		invariant(member instanceof GuildMember);
		invariant(typeof guildId === 'string');
		invariant(tenoId);
	} catch (e) {
		await interaction.editReply({
			content: `Sorry, I'm having trouble talking to discord right now, please try again later.`,
			components: [],
		});
		return;
	}

	if (voiceConfig) {
		try {
			playTextToSpeech({
				apiKey: voiceConfig.apiKey,
				voiceId: voiceConfig.voiceKey,
				text:
					thinkingTextVariations[Math.floor(Math.random() * thinkingTextVariations.length)] ??
					thinkingTextVariations[0],
				connection: getVoiceConnection(guildId),
			});
		} catch {
			// ignore
		}
	}

	try {
		const active = await teno.getPrismaClient().meeting.findFirst({
			where: {
				transcript: {
					isNot: null,
				},
				guildId,
				active: true,
				attendees: {
					some: {
						discordId: member.id,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
			include: {
				transcript: true,
			},
		});

		try {
			invariant(active && active.transcript);
		} catch (e) {
			await interaction.editReply({
				content: `You aren't in a meeting with me so I can't chime in.`,
				components: [],
			});
			return;
		}

		const transcriptKey = active.transcript.redisKey;
		const transcript = await Transcript.load({
			meetingId: active.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey,
		});
		const transcriptLines = await transcript?.getCleanedTranscript();
		invariant(transcriptLines);
		invariant(transcript);
		const answerOutput = await chimeInOnTranscript(transcriptLines);

		if (answerOutput.status === 'error') {
			throw new Error(answerOutput.error);
		}

		usageQueries.createUsageEvent(teno.getPrismaClient(), {
			discordGuildId: guildId,
			discordUserId: interaction.user.id,
			meetingId: active.id,
			languageModel: answerOutput.languageModel,
			promptTokens: answerOutput.promptTokens,
			completionTokens: answerOutput.completionTokens,
		});

		const answer = answerOutput.answer;

		const timestamp = Date.now();

		const transcriptLine = Utterance.createTranscriptLine(
			`Teno`,
			tenoId,
			answer,
			(timestamp - active.createdAt.getTime()) / 1000,
			timestamp,
		);

		await transcript.appendTranscript(transcriptLine, timestamp);

		if (voiceConfig) {
			try {
				playTextToSpeech({
					apiKey: voiceConfig.apiKey,
					voiceId: voiceConfig.voiceKey,
					text: answer,
					connection: getVoiceConnection(guildId),
				});
			} catch {
				// ignore
			}
		}

		await interaction.editReply({
			content: `${answer}`,
		});
	} catch (e) {
		await interaction.editReply({
			content: 'Sorry, something went wrong, please try again later.',
			components: [],
		});
	}
}
