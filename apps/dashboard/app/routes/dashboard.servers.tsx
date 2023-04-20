import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import React from 'react';
import { Outlet } from '@remix-run/react';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	// load a list of all guilds that the user is an admin of
	const guilds = await prisma.guild.findMany({
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
			VoiceServiceKey: {
				select: {
					createdAt: true,
				},
			},
		},
	});

	return json({
		guilds,
	});
};

const DashboardServers = () => {
	return (
		<div className="w-full flex flex-col gap-8">
			<Outlet />
		</div>
	);
};

export default DashboardServers;
