import type {
	ButtonInteraction,
	CommandInteraction,
	MessageActionRowComponentBuilder,
	StringSelectMenuInteraction,
} from 'discord.js';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';
import { MAX_SELECT_MENU_OPTIONS } from '@/constants.js';

const currentMeetingButton = 'removeMe-current-meeting';
const selectMenuId = 'removeMe-meeting-select';

export const removeMeCommand = createCommand({
	commandArgs: {
		name: 'remove-me',
		description: `Delete all of your speech from Teno's transcript for a meeting.`,
		options: [
			{
				name: 'search',
				description: '(optional) Search for a meeting by name or topic',
				required: false,
			},
		],
	},
	handler: removeMe,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleRemoveMeMeetingSelect }],
	buttonHandlers: [{ customId: currentMeetingButton, handler: handleRemoveMeMeetingCurrentButton }],
});

async function removeMe(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const search = String(interaction.options.get('search')?.value ?? '');

	try {
		const member = interaction.member;
		const memberIsGuildMember = member instanceof GuildMember;
		invariant(memberIsGuildMember && interaction.guildId);
		const memberDiscordId = member.id;
		invariant(memberDiscordId);
		const meetings = await teno.getPrismaClient().meeting.findMany({
			where: {
				guildId: interaction.guildId,
				attendees: {
					some: {
						discordId: memberDiscordId,
					},
				},
				...(search
					? {
							name: {
								contains: search,
							},
					  }
					: {}),
			},
			take: MAX_SELECT_MENU_OPTIONS,
			orderBy: {
				createdAt: 'desc',
			},
			include: {
				transcript: true,
			},
		});

		const meetingOptions = meetings.map((meeting) => ({
			label: meeting.name,
			value: String(meeting.id),
		}));

		let placeholder = 'Select a meeting';
		if (!meetings.length && search) {
			placeholder = `No meetings found for your search term...`;
		} else if (!meetings.length) {
			placeholder = `No meetings found`;
		}

		const selectMenu = new StringSelectMenuBuilder().setCustomId(selectMenuId).setPlaceholder(placeholder);

		if (meetingOptions.length) {
			selectMenu.addOptions(meetingOptions);
		} else {
			selectMenu.addOptions({
				label: 'No meetings found',
				value: 'no-meetings',
			});
			selectMenu.setDisabled(true);
		}

		const components = [
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new ButtonBuilder().setLabel('Current Meeting').setStyle(ButtonStyle.Primary).setCustomId(currentMeetingButton),
			),
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu),
		];

		await interaction.editReply({
			content: `Which meeting would you like to remove your speech from?`,
			components,
		});
	} catch (e) {
		if (search) {
			await interaction.editReply(
				`I could not find any meetings that you have attended with the search term "${search}".`,
			);
			return;
		}

		await interaction.editReply('I could not find any meetings that you have attended.');
	}
}

async function handleRemoveMeMeetingCurrentButton(interaction: ButtonInteraction, teno: Teno) {
	// Try to lookup the member's current meeting based on their voice channel, if they have one
	const guildId = interaction.guildId;
	const member = interaction.member;
	const memberInVoiceChannel = member instanceof GuildMember && member.voice.channel;
	const voiceChannelId = memberInVoiceChannel && member.voice.channelId;

	try {
		invariant(member);
		invariant(typeof guildId === 'string');
		invariant(memberInVoiceChannel);
		invariant(typeof voiceChannelId === 'string');
	} catch (e) {
		await interaction.update({
			content: 'You are not currently in a meeting with Teno.',
			components: [],
		});
		return;
	}

	try {
		const activeMeeting = await teno.getPrismaClient().meeting.findFirst({
			where: {
				active: true,
				channelId: voiceChannelId,
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
		invariant(activeMeeting && activeMeeting.transcript);

		const transcript = await Transcript.load({
			meetingId: activeMeeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey: activeMeeting.transcript.redisKey,
		});

		teno.getMeeting(activeMeeting.id)?.ignoreUser(member.id);

		invariant(transcript);
		transcript.removeUser(member.id);
	} catch (e) {
		await interaction.update({
			content: 'You are not currently in a meeting with Teno.',
			components: [],
		});
	}
}

async function handleRemoveMeMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
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
		include: {
			transcript: true,
		},
	});

	try {
		invariant(meeting && meeting.transcript);
	} catch (e) {
		console.error('Malformed meeting', e);
		await interaction.editReply('Please select a meeting.');
		return;
	}
	try {
		const transcript = await Transcript.load({
			meetingId: meeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey: meeting.transcript.redisKey,
		});

		invariant(transcript);
		invariant(interaction.user.id);
		transcript.removeUser(interaction.user.id);
	} catch (e) {
		await interaction.editReply({
			content: 'Sorry, I am having trouble removing you from the meeting right now. Please try again later.',
			components: [],
		});
	}
}
