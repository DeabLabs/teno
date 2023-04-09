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
		<div className="flex h-16 border-b border-b-gray-200 dark:border-b-gray-700 justify-center">
			<NavigationMenu className={clsx('sticky container top-0 z-40')}>
				<NavigationMenuList>
					{links.map((link) => (
						<NavigationMenuItem key={link.to} className={navigationMenuTriggerStyle()}>
							<Link to={link.to}>{link.label}</Link>
						</NavigationMenuItem>
					))}
				</NavigationMenuList>
			</NavigationMenu>
		</div>
	);
};

export default Navbar;
