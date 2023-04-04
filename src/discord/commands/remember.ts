import type { CommandInteraction, MessageActionRowComponentBuilder, StringSelectMenuInteraction } from 'discord.js';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { answerQuestionOnTranscript } from '@/services/langchain.js';
import { createCommand } from '@/discord/createCommand.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';

export const rememberCommand = createCommand(
	{
		name: 'remember',
		description: 'Ask Teno a question about a previous meeting you have attended',
		options: [
			{
				name: 'question',
				description: 'The question you want to ask',
				required: true,
			},
		],
	},
	remember,
	['remember-meeting-select', handleRememberMeetingSelect],
);

const makeRememberKey = (interaction: CommandInteraction | StringSelectMenuInteraction) =>
	`remember-${interaction.guildId}-${interaction.user.id}`;

async function remember(interaction: CommandInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });
	const question = interaction.options.get('question', true)?.value;

	try {
		invariant(question);
	} catch (e) {
		console.error('Malformed question', e);
		await interaction.editReply('Please enter a question.');
		return;
	}

	try {
		const member = interaction.member;
		const memberIsGuildMember = member instanceof GuildMember;
		invariant(memberIsGuildMember);
		const memberDiscordId = member.id;
		invariant(memberDiscordId);
		const meetings = await teno.getPrismaClient().meeting.findMany({
			where: {
				attendees: {
					some: {
						discordId: memberDiscordId,
					},
				},
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
				new ButtonBuilder()
					.setCustomId('remember-meeting-current')
					.setLabel('Current Meeting')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId('remember-meeting-all')
					.setLabel('All Meetings')
					.setStyle(ButtonStyle.Secondary),
			),
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('remember-meeting-select')
					.setPlaceholder('Select a meeting')
					.addOptions(...meetingOptions),
			),
		];

		// cache the question in redis so that we can retrieve it later in the handleRememberMeetingSelect function
		// we can key it by the discord user id, the guild id, and the command name
		await teno.getRedisClient().set(
			makeRememberKey(interaction),
			JSON.stringify({
				question,
			}),
		);

		await interaction.editReply({
			content: 'Which meeting would you like to remember a question about?',
			components,
		});
	} catch (e) {
		console.error(e);

		await interaction.editReply('I could not find any meetings you have attended.');
	}
}

async function handleRememberMeetingSelect(interaction: StringSelectMenuInteraction, teno: Teno) {
	await interaction.deferReply({ ephemeral: true });
	const meetingId = interaction.values?.[0];
	try {
		invariant(meetingId);
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
		const transcriptKey = meeting.transcript.redisKey;
		const transcript = await Transcript.load({
			meetingId: meeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey,
		});
		const transcriptLines = await transcript?.getCleanedTranscript();
		const question = await teno.getRedisClient().get(makeRememberKey(interaction));
		invariant(question);
		invariant(transcriptLines);
		const answer = await answerQuestionOnTranscript(question, transcriptLines);
		await interaction.editReply({
			content: answer,
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
		await interaction.editReply('I could not find an answer to your question.');
	}
}
