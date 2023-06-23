import type { LinksFunction } from '@vercel/remix';
import type { V2_MetaFunction } from '@remix-run/react';
import { Links, LiveReload, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';

import { TooltipProvider } from './components/ui/tooltip';
import styles from './tailwind.css';

export const links: LinksFunction = () => [
	{ rel: 'stylesheet', href: styles },
	{ rel: 'stylesheet', href: 'https://rsms.me/inter/inter.css' },
];

export const meta: V2_MetaFunction = () => {
	return [{ title: 'Teno Dashboard' }];
};

export default function App() {
	return (
		<html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body className="dark:bg-gray-900 antialiased dark:text-gray-50 font-sans min-h-screen bg-white text-gray-900">
				<TooltipProvider>
					<Outlet />
				</TooltipProvider>
				<ScrollRestoration />
				<Scripts />
				<LiveReload />
			</body>
		</html>
	);
}
