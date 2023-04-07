import type {
	CommandInteraction,
	MessageActionRowComponentBuilder,
	ModalActionRowComponentBuilder,
	ModalSubmitInteraction,
	StringSelectMenuInteraction,
} from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { CommandCache } from '@/models/CommandCache.js';

const selectMenuId = 'rename-meeting-select';
const modalId = 'rename-meeting-modal';

export const renameCommand = createCommand({
	commandArgs: {
		name: 'rename',
		description: 'Rename a meeting',
	},
	handler: rename,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleRenameMeetingSelect }],
	modalMenuHandlers: [{ customId: modalId, handler: handleRenameMeetingModal }],
});

async function rename(interaction: CommandInteraction, teno: Teno) {
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
					.setPlaceholder('Select a meeting to rename')
					.addOptions(...meetingOptions),
			),
		];

		await interaction.editReply({
			content: `Which meeting would you like to rename?`,
			components,
		});
	} catch (e) {
		console.error(e);
		await interaction.editReply('I could not find any meetings that you have created.');
	}
}

async function handleRenameMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
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
		await interaction.editReply('Could not find meeting.');
		return;
	}

	const cmdCache = new CommandCache({
		commandName: renameCommand.name,
		redisClient: teno.getRedisClient(),
		guildId: guildId,
		userDiscordId: interaction.user.id,
	});

	await cmdCache.setValue(meetingId);

	try {
		// Create a modal to rename the meeting
		const modal = new ModalBuilder().setCustomId(modalId).setTitle('Rename Meeting');

		// Add components to modal

		// Create the text input components
		const meetingRenameInput = new TextInputBuilder()
			.setCustomId('rename-meeting-text-input')
			// The label is the prompt the user sees for this input
			.setLabel('Enter a new name for the meeting')
			// Short means only a single line of text
			.setStyle(TextInputStyle.Short);

		// An action row only holds one text input,
		// so you need one action row per text input.
		const firstActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(meetingRenameInput);

		// Add inputs to the modal
		modal.addComponents(firstActionRow);
		await interaction.showModal(modal);
		await interaction.deleteReply();
	} catch (e) {
		console.error(e);
		await interaction.editReply({ content: 'I could not rename the meeting.', components: [] });
	}
}

async function handleRenameMeetingModal(interaction: ModalSubmitInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const guildId = interaction.guildId;
	const newName = interaction.fields.getTextInputValue('rename-meeting-text-input');

	try {
		invariant(newName);
		invariant(guildId);
	} catch (e) {
		await interaction.editReply('Please enter a name');
		return;
	}

	const cmdCache = new CommandCache({
		commandName: renameCommand.name,
		redisClient: teno.getRedisClient(),
		guildId: guildId,
		userDiscordId: interaction.user.id,
	});

	const meetingId = await cmdCache.getValue();

	try {
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
		await interaction.editReply('Could not rename meeting.');
		return;
	}
}
