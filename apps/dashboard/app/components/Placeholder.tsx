import React from 'react';

type PlaceholderProps = React.PropsWithChildren<{}>;

export const Placeholder = ({ children }: PlaceholderProps) => {
	return (
		<div className="flex min-h-full w-full items-center justify-center border-2 border-gray-700 dark:border-gray-200 border-dashed rounded my-8">
			{children}
		</div>
	);
};
