import type { LoaderArgs } from '@remix-run/node';
import { Outlet } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';

export const loader = async ({ request }: LoaderArgs) => {
	return await checkAuth(request);
};

const DashboardServers = () => {
	return (
		<div className="w-full flex flex-col gap-8">
			<Outlet />
		</div>
	);
};

export default DashboardServers;
