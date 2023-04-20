import type { LoaderArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import clsx from 'clsx';
import { NavLink, Outlet } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuList,
	navigationMenuTriggerStyle,
} from '@/components/ui/NavigationMenu';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	if (!user.admin) {
		return redirect('/dashboard');
	}

	return null;
};

const subLinks = [
	{ to: '/dashboard/admin', label: 'Admin' },
	{ to: '/dashboard/admin/manage-server-admins', label: 'Manage Server Admins' },
];

const Admin = () => {
	return (
		<div className="flex-col w-full">
			<NavigationMenu className="flex w-full gap-4 px-8 border-b border-b-gray-700">
				<NavigationMenuList>
					{subLinks.map((link) => (
						<NavigationMenuItem key={link.to} className={navigationMenuTriggerStyle()}>
							<NavLink
								to={link.to}
								className={({ isActive }) =>
									clsx(isActive && link.to !== '/dashboard/admin' && 'underline underline-offset-2')
								}
							>
								{link.label}
							</NavLink>
						</NavigationMenuItem>
					))}
				</NavigationMenuList>
			</NavigationMenu>
			<div className="container flex-col">
				<Outlet />
			</div>
		</div>
	);
};

export default Admin;
