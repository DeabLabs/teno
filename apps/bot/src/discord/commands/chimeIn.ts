import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';
import { usageQueries } from 'database';

import { chimeInOnTranscript } from '@/services/langchain.js';
import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';
import { Utterance } from '@/models/utterance.js';

export const chimeInCommand = createCommand({
	commandArgs: {
		name: 'chime-in',
		description: `Teno will publicly give its opinion the most recent question or topic.`,
	},
	handler: chimeIn,
});

async function chimeIn(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply();

	const guildId = interaction.guildId;
	const member = interaction.member;
	const tenoId = teno.getClient().user?.id;

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

		await interaction.editReply({
			content: `Meeting: ${active.name}\n${answer}`,
		});
	} catch (e) {
		await interaction.editReply({
			content: 'Sorry, something went wrong, please try again later.',
			components: [],
		});
	}
}