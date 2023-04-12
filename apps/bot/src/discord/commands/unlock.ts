import type { CommandInteraction, MessageActionRowComponentBuilder, StringSelectMenuInteraction } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';

const selectMenuId = 'unlock-meeting-select';

export const unlockCommand = createCommand({
	commandArgs: {
		name: 'unlock',
		description: 'unlock a meeting, making it accessible to everyone on the server',
	},
	handler: unlock,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleUnlockMeetingSelect }],
});

async function unlock(interaction: CommandInteraction, teno: Teno) {
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
				locked: true,
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
					.setPlaceholder('Select a meeting to unlock')
					.addOptions(...meetingOptions),
			),
		];

		await interaction.editReply({
			content: `Which meeting would you like to unlock? This means that anyone on the server can ask Teno about it.`,
			components,
		});
	} catch (e) {
		console.error(e);
		await interaction.editReply('I could not find any locked meetings that you have created.');
	}
}

async function handleUnlockMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
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
	try {
		await teno.getPrismaClient().meeting.update({
			where: {
				id: Number(meetingId),
			},
			data: {
				locked: false,
			},
		});
	} catch {
		await interaction.update({ content: 'Could not find meeting.', components: [] });
		return;
	}

	// Send a reply to the user confirming the meeting has been locked
	await interaction.update({ content: `The meeting "${meeting.name}" has been unlocked.`, components: [] });
}
