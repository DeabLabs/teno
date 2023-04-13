import type {
	ButtonInteraction,
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

const currentMeetingButton = 'ask-current-meeting';
const askShareButton = 'ask-share';
const selectMenuId = 'ask-meeting-select';
const modalId = 'ask-meeting-modal';

export const askCommand = createCommand({
	commandArgs: {
		name: 'ask',
		description: 'Ask Teno a question about a meeting, or for help with a meeting.',
		options: [
			{
				name: 'search',
				description: '(optional) Search for a meeting by name or topic',
				required: false,
			},
		],
	},
	handler: ask,
	selectMenuHandlers: [{ customId: selectMenuId, handler: handleAskMeetingSelect }],
	modalMenuHandlers: [{ customId: modalId, handler: handleAskMeetingModal }],
	buttonHandlers: [
		{ customId: currentMeetingButton, handler: handleAskMeetingCurrentButton },
		{ customId: askShareButton, handler: handleAskShareButton },
	],
});

async function ask(interaction: CommandInteraction, teno: Teno) {
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
				OR: [
					{
						attendees: {
							some: {
								discordId: memberDiscordId,
							},
						},
					},
					{ locked: false },
				],
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
			content: `Which meeting would you like me to help you with?\n\nYour request will be private unless you choose to share it with the channel.`,
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

async function handleAskMeetingCurrentButton(interaction: ButtonInteraction, teno: Teno) {
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
			content:
				'You are not in a meeting with Teno. Try joining a voice channel and then using /join start a meeting with Teno!',
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
		const cmdCache = new CommandCache({
			redisClient: teno.getRedisClient(),
			guildId,
			userDiscordId: interaction.user.id,
			commandName: askCommand.name,
		});

		const meetingId = activeMeeting.id;
		await cmdCache.setValue(String(meetingId));
		await displayPromptModal(interaction);
	} catch (e) {
		await interaction.update({
			content: 'You are not in a meeting with Teno. Try using /join start a meeting with Teno!',
			components: [],
		});
	}
}

async function handleAskMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
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
		commandName: askCommand.name,
	});

	await cmdCache.setValue(String(meetingId));

	try {
		await displayPromptModal(interaction);
	} catch (e) {
		await interaction.editReply({
			content: 'Sorry, I am having trouble reading your meeting right now. Please try again later.',
			components: [],
		});
	}
}

async function handleAskMeetingModal(interaction: ModalSubmitInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });

	const guildId = interaction.guildId;
	const question = interaction.fields.getTextInputValue('ask-meeting-text-input');

	try {
		invariant(question);
		invariant(guildId);
	} catch (e) {
		await interaction.editReply('Please enter a request for me to complete!');
		return;
	}

	const cmdCache = new CommandCache({
		commandName: askCommand.name,
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
						.setCustomId(askShareButton)
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

/**
 * Handles the "Share Answer in Channel" button on the /ask command
 */
async function handleAskShareButton(interaction: ButtonInteraction) {
	try {
		await interaction.deferReply({ ephemeral: false });
		await interaction.editReply({ content: interaction.message.content });
	} catch (e) {
		console.error(e);
		await interaction.reply({ content: 'Something went wrong', ephemeral: true });
	}
}

async function displayPromptModal(interaction: CommandInteraction | StringSelectMenuInteraction | ButtonInteraction) {
	// Create a modal to rename the meeting
	const modal = new ModalBuilder().setCustomId(modalId).setTitle('Ask Teno about this meeting');

	// Add components to modal

	// Create the text input components
	const meetingRenameInput = new TextInputBuilder()
		.setCustomId('ask-meeting-text-input')
		// The label is the prompt the user sees for this input
		.setLabel('Enter your request to Teno')
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
}
