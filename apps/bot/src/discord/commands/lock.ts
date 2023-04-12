import type { CommandInteraction, MessageActionRowComponentBuilder, StringSelectMenuInteraction } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

const selectMenuId = 'lock-meeting-select';

export const lockCommand = createCommand({
	commandArgs: {
		name: 'lock',
		description: 'lock a meeting, making it only accessible to the attendees',
	},
	handler: lock,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleLockMeetingSelect }],
});

async function lock(interaction: CommandInteraction, teno: Teno) {
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
				locked: false,
			},
			take: 20,
			orderBy: {
				createdAt: 'desc',
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
					.setPlaceholder('Select a meeting to lock')
					.addOptions(...meetingOptions),
			),
		];

		await interaction.editReply({
			content: `Which meeting would you like to lock? This means that only attendees will be able to ask Teno about it.`,
			components,
		});
	} catch (e) {
		console.error(e);
		await interaction.editReply('I could not find any unlocked meetings that you have created.');
	}
}

async function handleLockMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
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

	const meeting = await teno.getPrismaClient().meeting.findUnique({
		where: {
			id: Number(meetingId),
		},
	});

	try {
		invariant(meeting);
	} catch (e) {
		await interaction.update({ content: 'Could not find meeting.', components: [] });
		return;
	}

	// After the meeting is fetched and validated
	await teno.getPrismaClient().meeting.update({
		where: {
			id: Number(meetingId),
		},
		data: {
			locked: true,
		},
	});

	await interaction.update({ content: `The meeting "${meeting.name}" has been locked.`, components: [] });
}
