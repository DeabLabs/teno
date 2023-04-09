import type { LoaderArgs } from '@remix-run/node';
import { Outlet } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import type { LinkItem } from '@/components/Navbar';
import Navbar from '@/components/Navbar';

export const loader = async ({ request }: LoaderArgs) => {
	return checkAuth(request);
};

const links: LinkItem[] = [
	{ to: '/dashboard', label: 'Dashboard' },
	{ to: '/dashboard/meetings', label: 'Meetings' },
];

const Dashboard = () => {
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
