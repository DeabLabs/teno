import { Loader2 } from 'lucide-react';
import React, { useEffect } from 'react';

type LoaderProps = React.PropsWithChildren<{}>;

export const Loader = ({ children }: LoaderProps) => {
	const [visible, setVisible] = React.useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setVisible(true);
		}, 500);
		return () => clearTimeout(timer);
	}, []);

	if (!visible) return null;

	return (
		<div className="flex min-h-full w-full items-center justify-center border-2 border-gray-700 dark:border-gray-200 border-dashed rounded my-8 animate-fade-in">
			{children || <Loader2 className="animate-spin" />}
		</div>
	);
};
