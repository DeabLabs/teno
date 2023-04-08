import type { CommandInteraction } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { formatMeetingList } from '@/utils/formatMeetingList.js';

export const listCommand = createCommand({
	commandArgs: {
		name: 'list',
		description: 'List recent meetings that you have attended.',
		options: [
			{
				name: 'limit',
				description: 'Limit the number of meetings to list.',
				required: false,
				choices: [
					{ name: '10', value: '10' },
					{ name: '25', value: '25' },
					{ name: '50', value: '50' },
				],
			},
		],
	},
	handler: list,
});

async function list(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	try {
		const member = interaction.member;
		const memberIsGuildMember = member instanceof GuildMember;
		const guildId = interaction.guildId;
		invariant(memberIsGuildMember && guildId);

		let limit = Number(interaction.options.get('limit')?.value ?? 10);
		if (isNaN(limit) || !limit || limit > 50) {
			limit = 10;
		}

		const meetings = await teno.getPrismaClient().meeting.findMany({
			where: {
				attendees: {
					some: {
						discordId: member.id,
					},
				},
			},
			take: limit,
			select: {
				name: true,
				createdAt: true,
			},
			orderBy: {
				createdAt: 'desc',
			},
		});

		if (!meetings.length) {
			await interaction.editReply(
				'You have not attended any meetings. Use /join while in a voice channel to start a meeting!',
			);
			return;
		}

		const meetingList = formatMeetingList(meetings);

		await interaction.editReply(`Here are the ${limit} most recent meetings you've attended!\n${meetingList}`);
	} catch {
		await interaction.editReply('I am having trouble listing your meetings. Please try again later.');
		return;
	}
}
