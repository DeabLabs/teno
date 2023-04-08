import { isThisMonth, isThisWeek, isThisYear, isToday } from 'date-fns';

export type PartialMeeting = {
	name: string;
	createdAt: Date;
};

/**
 * Given a sorted list of meetings (oldest to newest), format them into a string like so:
 * @example
 * `Today
 * - Meeting 1
 * This week
 * - Meeting 2
 * - Meeting 3
 * Older
 * - Meeting 4
 * `
 * @returns newline separated string
 */
export function formatMeetingList(meetings: PartialMeeting[]): string {
	meetings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	const ranges = [
		{ label: 'Today', check: isToday },
		{ label: 'This week', check: isThisWeek },
		{ label: 'This month', check: isThisMonth },
		{ label: 'This year', check: isThisYear },
		{ label: 'Older', check: () => true },
	].map((range) => ({ ...range, label: `**${range.label}**` }));

	const output: string[] = [];

	let rangeIndex: keyof typeof ranges = 0;

	for (const meeting of meetings) {
		const meetingDate = new Date(meeting.createdAt);
		let range = ranges[rangeIndex] ?? (ranges[ranges.length - 1] as (typeof ranges)[number]);

		// Move to the next range if the current meeting does not belong to the current one
		while (!range.check(meetingDate)) {
			rangeIndex++;
			range = ranges[rangeIndex] ?? (ranges[ranges.length - 1] as (typeof ranges)[number]);
		}

		// If there's a new range, add it to the output
		if (range.label) {
			const content = `${range.label}`;
			output.push(content);
			// Remove the label to avoid printing it again
			range.label = '';
		}

		// Add the meeting name to the output
		const content = `> - ${meeting.name}`;
		output.push(content);
	}

	return output.join('\n');
}
