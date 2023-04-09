// import React from 'react';
import { Link } from '@remix-run/react';
import clsx from 'clsx';

import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuList,
	navigationMenuTriggerStyle,
} from './ui/NavigationMenu';

export type LinkItem = {
	to: string;
	label: string;
};

type NavbarProps = {
	links: LinkItem[];
};

const Navbar = ({ links }: NavbarProps) => {
	return (
		<div
			className={clsx(
				'sticky top-0 z-50 bg-gray-900',
				'flex h-16 border-b border-b-gray-200 dark:border-b-gray-700 justify-center',
			)}
		>
			<div className="flex container w-full h-full justify-between">
				<NavigationMenu>
					<NavigationMenuList>
						{links.map((link) => (
							<NavigationMenuItem key={link.to} className={navigationMenuTriggerStyle()}>
								<Link to={link.to}>{link.label}</Link>
							</NavigationMenuItem>
						))}
					</NavigationMenuList>
				</NavigationMenu>
				<NavigationMenu aria-label="Authentication" className="justify-end">
					<NavigationMenuItem className={navigationMenuTriggerStyle()}>
						<Link to="/logout">Logout</Link>
					</NavigationMenuItem>
				</NavigationMenu>
			</div>
		</div>
	);
};

export default Navbar;
