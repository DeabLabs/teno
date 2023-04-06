import type { ButtonInteraction, CommandInteraction, MessageActionRowComponentBuilder } from 'discord.js';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { ActionRowBuilder } from 'discord.js';
import { GuildMember } from 'discord.js';
import invariant from 'tiny-invariant';

import { createCommand } from '@/discord/createCommand.js';
import { answerQuestionOnTranscript } from '@/services/langchain.js';
import type { Teno } from '@/models/teno.js';
import { Transcript } from '@/models/transcript.js';

export const askCommand = createCommand({
	commandArgs: {
		name: 'ask',
		description: 'Ask Teno a question about the meeting you are in',
		options: [
			{
				name: 'question',
				description: 'The question you want to ask',
				required: true,
			},
		],
	},
	handler: ask,
	buttonHandlers: [{ customId: 'ask-share', handler: askShareHandler }],
});

async function ask(interaction: CommandInteraction, teno: Teno) {
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
		// Try to lookup the member's current meeting based on their voice channel, if they have one
		const member = interaction.member;
		const memberInVoiceChannel = member instanceof GuildMember && member.voice.channel;
		invariant(memberInVoiceChannel);
		const voiceChannelId = memberInVoiceChannel && member.voice.channelId;
		invariant(voiceChannelId);
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
			include: {
				transcript: true,
			},
		});
		invariant(activeMeeting && activeMeeting.transcript);
		const meetingTranscript = await Transcript.load({
			meetingId: activeMeeting.id,
			prismaClient: teno.getPrismaClient(),
			redisClient: teno.getRedisClient(),
			transcriptKey: activeMeeting.transcript.redisKey,
		});
		invariant(meetingTranscript);

		const transcriptLines = await meetingTranscript.getCleanedTranscript();
		const answer = await answerQuestionOnTranscript(String(question), transcriptLines);

		await interaction.editReply({
			content: `Question: ${question}\nAnswer: ${answer}`,
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
		await interaction.editReply(
			"You are not in a meeting with Teno. Try /remember to ask Teno a question about a meeting you've previously been in.",
		);
	}
}

/**
 * Handles the "Share Answer in Channel" button on the /ask command
 *
 * Read the question cached in cmdCache, send it into the channel as a new message
 */
async function askShareHandler(interaction: ButtonInteraction) {
	try {
		await interaction.deferReply({ ephemeral: false });
		await interaction.editReply({ content: interaction.message.content });
	} catch (e) {
		console.error(e);
		await interaction.reply({ content: 'Something went wrong', ephemeral: true });
	}
}
