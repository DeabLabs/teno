import type { CommandInteraction, MessageActionRowComponentBuilder } from 'discord.js';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { ActionRowBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';
import { usageQueries } from 'database';

import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';

import { askShareButton } from './askPast.js';

export const askCommand = createCommand({
	commandArgs: {
		name: 'ask',
		description: 'Ask Teno about your current or most recent meeting.',
		options: [
			{
				name: 'prompt',
				description: 'The prompt you want to send to Teno',
				required: true,
			},
		],
	},
	handler: ask,
});

async function ask(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const prompt = String(interaction.options.get('prompt')?.value ?? '');
	const guildId = interaction.guildId;
	const member = interaction.member;

	try {
		invariant(prompt);
		invariant(member instanceof GuildMember);
		invariant(typeof guildId === 'string');
	} catch (e) {
		await interaction.editReply({
			content: `Sorry, I'm having trouble talking to discord right now, please try again later.`,
			components: [],
		});
		return;
	}

	try {
		const activeOrLastMeeting = await teno.getPrismaClient().meeting.findFirst({
			where: {
				transcript: {
					isNot: null,
				},
				guildId,
				OR: [
					{
						active: true,
						attendees: {
							some: {
								discordId: member.id,
							},
						},
					},
					{
						attendees: {
							some: {
								discordId: member.id,
							},
						},
					},
				],
			},
			orderBy: {
				createdAt: 'desc',
			},
			include: {
				transcript: true,
			},
		});
		invariant(activeOrLastMeeting && activeOrLastMeeting.transcript);

		const transcriptKey = activeOrLastMeeting.transcript.redisKey;
		const transcript = await Transcript.load({
			meetingId: activeOrLastMeeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey,
		});
		const transcriptLines = await transcript?.getCleanedTranscript();
		invariant(transcriptLines);
		const answerOutput = await answerQuestionOnTranscript(prompt, interaction.user.username, transcriptLines);

		if (answerOutput.status === 'error') {
			throw new Error(answerOutput.error);
		}

		usageQueries.createUsageEvent(teno.getPrismaClient(), {
			discordGuildId: guildId,
			discordUserId: interaction.user.id,
			meetingId: activeOrLastMeeting.id,
			languageModel: answerOutput.languageModel,
			promptTokens: answerOutput.promptTokens,
			completionTokens: answerOutput.completionTokens,
		});

		const answer = answerOutput.answer;

		await interaction.editReply({
			content: `Meeting: ${activeOrLastMeeting.name}\n[${prompt}]\n${answer}`,
			components: [
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(askShareButton)
						.setStyle(ButtonStyle.Secondary)
						.setLabel('Share Answer in Channel'),
				),
			],
		});
	} catch (e) {
		await interaction.editReply({
			content: "Sorry, you haven't attended any meetings yet.",
			components: [],
		});
	}
}
