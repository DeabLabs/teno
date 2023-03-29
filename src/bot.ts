import { GatewayIntentBits } from 'discord-api-types/v10';
import { Constants, Client } from 'discord.js';
import { Config } from './config.js';
import { deploy } from './deploy.js';
import { Teno } from './teno.js';
import { createClient } from 'redis';

export type RedisClient = typeof redisClient;

// Initialize Redis client
const redisClient = createClient();

redisClient.on('error', (err) => {
	console.log('Redis Client Error', err);
	process.exit(1);
});

redisClient.on('connect', () => {
	console.log('Redis Client Connected');
});

await redisClient.connect();

// Initialize Discord client
const { Events } = Constants;
const botToken = Config.TOKEN;
const client = new Client({
	intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds],
});

client.on(Events.CLIENT_READY, () => console.log('App started'));

client.on(Events.CLIENT_READY, async () => {
	// Automatically deploy the commands to all guilds the bot is in
	for (const guild of client.guilds.cache.values()) {
		await deploy(guild);
	}
	// Uncomment the following line if you want to deploy the commands globally (this had to do with the !deploy command not working)
	// await deploy(client.guilds.cache.first());
});

client.on(Events.ERROR, console.warn);

// Instantiate Tenos for each guild
const tenoInstances = new Map<string, Teno>();
client.on(Events.CLIENT_READY, () => {
	client.guilds.cache.forEach((guild) => {
		const tenoInstance = new Teno({ client, guild, redisClient });
		tenoInstances.set(guild.id, tenoInstance);
	});
});

client.on('guildCreate', (guild) => {
	const tenoInstance = new Teno({ client, guild, redisClient });
	tenoInstances.set(guild.id, tenoInstance);
});

client.on('guildDelete', (guild) => {
	tenoInstances.delete(guild.id);
});

void client.login(botToken);
