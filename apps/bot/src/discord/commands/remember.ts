import type {
	CommandInteraction,
	MessageActionRowComponentBuilder,
	ModalActionRowComponentBuilder,
	ModalSubmitInteraction,
	StringSelectMenuInteraction,
} from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';
import { CommandCache } from '@/models/CommandCache.js';
import { MAX_SELECT_MENU_OPTIONS } from '@/constants.js';

const selectMenuId = 'remember-meeting-select';
const modalId = 'remember-meeting-modal';

export const rememberCommand = createCommand({
	commandArgs: {
		name: 'remember',
		description: 'Prompt Teno about a meeting you have attended.',
		options: [
			{
				name: 'search',
				description: 'Search for a meeting by name or topic',
				required: false,
			},
		],
	},
	handler: remember,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleRememberMeetingSelect }],
	modalMenuHandlers: [{ customId: modalId, handler: handleRememberMeetingModal }],
});

async function remember(interaction: CommandInteraction, teno: Teno) {
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
		invariant(meetings.length);

		const meetingOptions = meetings.map((meeting) => ({
			label: meeting.name,
			value: String(meeting.id),
		}));

		const components = [
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('remember-meeting-select')
					.setPlaceholder('Select a meeting')
					.addOptions(...meetingOptions),
			),
		];

		await interaction.editReply({
			content: `In which meeting would you like me to find the answer to your question?`,
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

async function handleRememberMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
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

	const cmdCache = new CommandCache({
		redisClient: teno.getRedisClient(),
		guildId,
		userDiscordId: interaction.user.id,
		commandName: rememberCommand.name,
	});

	await cmdCache.setValue(String(meetingId));

	try {
		// Create a modal to rename the meeting
		const modal = new ModalBuilder().setCustomId(modalId).setTitle('Remember Meeting');

		// Add components to modal

		// Create the text input components
		const meetingRenameInput = new TextInputBuilder()
			.setCustomId('remember-meeting-text-input')
			// The label is the prompt the user sees for this input
			.setLabel('Enter your question')
			// Short means only a single line of text
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setPlaceholder('Can you summarize this meeting?');

		// An action row only holds one text input,
		// so you need one action row per text input.
		const firstActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(meetingRenameInput);

		// Add inputs to the modal
		modal.addComponents(firstActionRow);
		await interaction.showModal(modal);
		await interaction.deleteReply();
	} catch (e) {
		console.error(e);
		await interaction.editReply({ content: 'I could not remember your meeting...', components: [] });
	}
}

async function handleRememberMeetingModal(interaction: ModalSubmitInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const guildId = interaction.guildId;
	const question = interaction.fields.getTextInputValue('remember-meeting-text-input');

	try {
		invariant(question);
		invariant(guildId);
	} catch (e) {
		await interaction.editReply('Please enter a question');
		return;
	}

	const cmdCache = new CommandCache({
		commandName: rememberCommand.name,
		redisClient: teno.getRedisClient(),
		guildId: guildId,
		userDiscordId: interaction.user.id,
	});

	const meetingId = await cmdCache.getValue();
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
		const transcriptKey = meeting.transcript.redisKey;
		const transcript = await Transcript.load({
			meetingId: meeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey,
		});
		const transcriptLines = await transcript?.getCleanedTranscript();
		invariant(transcriptLines);
		const answer = await answerQuestionOnTranscript(question, transcriptLines);
		await interaction.editReply({
			content: `Meeting: ${meeting.name}\n[${question}]\n${answer}`,
			components: [
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId('ask-share')
						.setStyle(ButtonStyle.Secondary)
						.setLabel('Share Answer in Channel'),
				),
			],
		});
	} catch (e) {
		console.error(e);
		await interaction.editReply({ content: 'I could not find an answer to your question.', components: [] });
	}
}
