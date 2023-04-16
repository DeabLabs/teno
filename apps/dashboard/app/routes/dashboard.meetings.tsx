import type { LoaderArgs } from '@remix-run/node';
import { Outlet, useLocation, useNavigate } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';

export const loader = async ({ request }: LoaderArgs) => {
	return checkAuth(request);
};

const DashboardMeetings = () => {
	const n = useNavigate();
	const l = useLocation();

	return (
		<div className="flex flex-col w-full gap-8">
			<div className="sm:px-4 mt-8">
				<Tabs
					activationMode="manual"
					value={l.pathname}
					onValueChange={(v) => {
						n(v);
					}}
				>
					<TabsList>
						<TabsTrigger value="/dashboard/meetings/authored">Authored</TabsTrigger>
						<TabsTrigger value="/dashboard/meetings/attended">Attended</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
			<Outlet />
		</div>
	);
};

export default DashboardMeetings;
