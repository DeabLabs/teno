import type { LoaderArgs } from '@remix-run/node';
import { defer } from '@remix-run/node';
import React, { Suspense } from 'react';
import { Await, useLoaderData } from '@remix-run/react';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Loader } from '@/components/Loader';
import { Placeholder } from '@/components/Placeholder';
import GuildTable from '@/components/GuildTable';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	// load a list of all guilds that the user is an admin of
	const guilds = prisma.guild
		.findMany({
			where: {
				admins: {
					some: {
						id: user.id,
					},
				},
			},
			select: {
				id: true,
				name: true,
				guildId: true,
				updatedAt: true,
				voiceService: {
					select: {
						createdAt: true,
					},
				},
			},
		})
		.then((guilds) => {
			return guilds.map(({ voiceService: _v, ...guild }) => {
				return {
					...guild,
					updatedAt: guild.updatedAt?.toISOString(),
					voiceServiceKeyCreatedAt: _v?.createdAt?.toISOString(),
				};
			});
		});

	return defer({
		guilds,
	});
};

const DashboardServersIndex = () => {
	const { guilds } = useLoaderData<typeof loader>();

	return (
		<div className="flex flex-col w-full gap-8">
			<div className="mt-8 sm:px-4">
				<div className="sm:flex sm:items-center">
					<div className="sm:flex-auto">
						<h1 className="text-base font-semibold leading-6 text-white">Administered Servers</h1>
						<p className="mt-2 text-sm text-gray-300">
							A list of all the discord servers that you have administrative rights to Teno in.
						</p>
					</div>
				</div>
				<Suspense fallback={<Loader />}>
					<Await resolve={guilds} errorElement={<Placeholder children={<>Could not load servers...</>} />}>
						{(guilds) =>
							guilds.length > 0 ? (
								<GuildTable guilds={guilds} />
							) : (
								<p className="flex px-auto py-auto mt-8 font-bold">You do not administer any servers with Teno</p>
							)
						}
					</Await>
				</Suspense>
			</div>
		</div>
	);
};

export default DashboardServersIndex;
