import type { CommandInteraction, MessageActionRowComponentBuilder, StringSelectMenuInteraction } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';
import { usageQueries } from 'database';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';
import { generateMeetingName } from '@/services/langchain.js';

const selectMenuId = 'auto-rename-meeting-select';

export const autoRenameCommand = createCommand({
	commandArgs: {
		name: 'autorename',
		description: 'Automatically generate a new meeting name',
	},
	handler: autoRename,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleRenameMeetingSelect }],
});

async function autoRename(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		const member = interaction.member;
		const memberIsGuildMember = member instanceof GuildMember;
		invariant(memberIsGuildMember && interaction.guildId);
		const memberDiscordId = member.id;
		invariant(memberDiscordId);
		const meetings = await teno.getPrismaClient().meeting.findMany({
			where: {
				author: {
					discordId: memberDiscordId,
				},
			},
			take: 20,
			orderBy: {
				createdAt: 'desc',
			},
			include: {
				transcript: true,
			},
		});
		invariant(meetings.length);

		const meetingOptions = meetings.map((meeting) => ({
			label: meeting.name,
			value: String(meeting.id),
		}));

		const components = [
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(selectMenuId)
					.setPlaceholder('Select a meeting to automatically rename')
					.addOptions(...meetingOptions),
			),
		];

		await interaction.editReply({
			content: `Which meeting would you like to automatically rename?`,
			components,
		});
	} catch (e) {
		console.error(e);
		await interaction.editReply('I could not find any meetings that you have created.');
	}
}

async function handleRenameMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
	await interaction.update({ components: [], content: 'Coming up with a new name for this meeting...' });
	const guildId = interaction.guildId;
	const meetingId = interaction.values?.[0];

	try {
		invariant(meetingId);
		invariant(guildId);
	} catch (e) {
		console.error('Malformed meetingId', e);
		await interaction.editReply('Please select a meeting.');
		return;
	}

	try {
		const meeting = await teno.getPrismaClient().meeting.findUnique({
			where: {
				id: Number(meetingId),
			},
			include: {
				transcript: true,
			},
		});

		invariant(meeting);
		invariant(meeting.transcript);

		const transcript = await Transcript.load({
			meetingId: meeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey: meeting.transcript.redisKey,
		});

		invariant(transcript);

		const transcriptText = await transcript.getCleanedTranscript();
		const resolved = await generateMeetingName(transcriptText, 'gpt-3.5-turbo-16k');
		if (resolved.status === 'error') {
			throw new Error(resolved.error);
		}

		const newName = resolved.answer;

		usageQueries.createUsageEvent(teno.getPrismaClient(), {
			discordGuildId: guildId,
			meetingId: meeting.id,
			languageModel: resolved.languageModel,
			promptTokens: resolved.promptTokens,
			completionTokens: resolved.completionTokens,
		});

		await teno.getPrismaClient().meeting.update({
			where: {
				id: Number(meetingId),
			},
			data: {
				name: newName,
				manuallyRenamed: true,
			},
		});

		await interaction.editReply(`Meeting renamed to ${newName}`);
	} catch (e) {
		console.error(e);
		await interaction.editReply('Could not autoRename meeting.');
		return;
	}
}
