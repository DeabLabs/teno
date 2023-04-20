import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Outlet, useLoaderData } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import type { LinkItem } from '@/components/Navbar';
import Navbar from '@/components/Navbar';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	return json({
		user,
	});
};

const _links: (LinkItem & { admin?: boolean })[] = [
	{ to: '/dashboard', label: 'Dashboard' },
	{ to: '/dashboard/meetings', label: 'Meetings' },
	{ to: '/dashboard/servers', label: 'Servers' },
	{ to: '/dashboard/admin', label: 'Admin', admin: true },
];

const Dashboard = () => {
	const { user } = useLoaderData<typeof loader>();
	const links = _links.filter((link) => !link.admin || user.admin);
	return (
		<div className="flex flex-col min-h-screen">
			<Navbar links={links} />
			<div className="flex flex-1 self-center w-full container px-4 sm:px-0">
				<Outlet />
			</div>
		</div>
	);
};

export default Dashboard;
