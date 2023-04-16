import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { formatDuration, intervalToDuration } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const formatMeetingDuration = (ms: number) => {
	const duration = intervalToDuration({ start: 0, end: ms });

	const zeroPad = (num: number) => String(num).padStart(2, '0');

	return formatDuration(duration, {
		format: ['hours', 'minutes', 'seconds'],
		zero: true,
		delimiter: ':',
		locale: {
			formatDistance: (_token, count) => zeroPad(count),
		},
	});
};
