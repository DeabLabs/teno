import { unescapeLeadingUnderscores } from 'typescript';
import type { PrismaClientType } from '../index.js';

type CreateUsageEventArgs =
	| {
			discordUserId?: string;
			discordGuildId: string;
			meetingId?: number;
			languageModel: string;
			promptTokens: number;
			completionTokens: number;
	  }
	| {
			discordUserId?: string;
			discordGuildId: string;
			meetingId: number;
			utteranceDurationSeconds: number | undefined;
	  };

/**
 * Create a new usage event
 *
 * @param client - The prisma client
 * @param args - The arguments to the query
 * @returns The usage event
 */
export const createUsageEvent = async (client: PrismaClientType, args: CreateUsageEventArgs) => {
	const usageEvent = await client.usageEvent.create({
		data: {
			...(args.discordUserId
				? {
						user: {
							connect: {
								discordId: args.discordUserId,
							},
						},
				  }
				: {}),
			guild: {
				connect: {
					guildId: args.discordGuildId,
				},
			},
			meeting: {
				...(args.meetingId !== undefined
					? {
							connect: {
								id: args.meetingId,
							},
					  }
					: {}),
			},
			...('languageModel' in args
				? {
						languageModel: args.languageModel || null,
						promptTokensUsed: args.promptTokens || 0,
						completionTokensUsed: args.completionTokens || 0,
				  }
				: {
						utteranceDurationSeconds: args.utteranceDurationSeconds || 0,
				  }),
		},
	});
	return usageEvent;
};
