import { getVoiceConnection } from '@discordjs/voice';
import { GatewayIntentBits } from 'discord-api-types/v10';
import { Interaction, Constants, Client } from 'discord.js';
import { Config } from './config';
import { deploy } from './deploy';
import { interactionHandlers } from './interactions';

const botToken = Config.get('TOKEN');

const client = new Client({
	intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds],
});

const { Events } = Constants;

client.on(Events.CLIENT_READY, () => console.log('Ready!'));

client.on(Events.CLIENT_READY, async () => {
	// Automatically deploy the commands to all guilds the bot is in
	for (const guild of client.guilds.cache.values()) {
		await deploy(guild);
	}
	// Uncomment the following line if you want to deploy the commands globally (this had to do with the !deploy command not working)
	// await deploy(client.guilds.cache.first());
});

/**
 * The IDs of the users that can be recorded by the bot.
 */
const recordable = new Set<string>();

client.on(Events.INTERACTION_CREATE, async (interaction: Interaction) => {
	if (!interaction.isCommand() || !interaction.guildId) return;

	const handler = interactionHandlers.get(interaction.commandName);

	try {
		if (handler) {
			await handler(interaction, recordable, client, getVoiceConnection(interaction.guildId));
		} else {
			await interaction.reply('Unknown command');
		}
	} catch (error) {
		console.warn(error);
	}
});

client.on(Events.ERROR, console.warn);

void client.login(botToken);
