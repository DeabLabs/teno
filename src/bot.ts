import { PrismaClient } from '@prisma/client';
import { GatewayIntentBits } from 'discord-api-types/v10';
import { Client, Events } from 'discord.js';
import { createClient } from 'redis';

import { Config } from './config.js';
import { deploy } from './discord/deploy.js';
import { Teno } from './models/teno.js';

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

// Initialize prisma client

const prismaClient = new PrismaClient();

await prismaClient.$connect();

console.log('Prisma Client Connected');

// Initialize Discord client
const botToken = Config.TOKEN;
const client = new Client({
	intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds],
});

client.on(Events.ClientReady, () => console.log('App started'));

client.on(Events.ClientReady, async () => {
	// Automatically deploy the commands to all guilds the bot is in
	for (const guild of client.guilds.cache.values()) {
		await deploy(guild);
	}
	// Uncomment the following line if you want to deploy the commands globally (this had to do with the !deploy command not working)
	// await deploy(client.guilds.cache.first());
});

client.on(Events.Error, console.warn);

// Instantiate Tenos for each guild
const tenoInstances = new Map<string, Teno>();
client.on(Events.ClientReady, () => {
	client.guilds.cache.forEach((guild) => {
		const tenoInstance = new Teno({ client, guild, redisClient, prismaClient });
		tenoInstances.set(guild.id, tenoInstance);
	});
});

client.on('guildCreate', (guild) => {
	const tenoInstance = new Teno({ client, guild, redisClient, prismaClient });
	tenoInstances.set(guild.id, tenoInstance);
});

client.on('guildDelete', (guild) => {
	tenoInstances.delete(guild.id);
});

const cleanup = () => {
	redisClient.disconnect();
	prismaClient.$disconnect();
	client.destroy();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

void client.login(botToken);
