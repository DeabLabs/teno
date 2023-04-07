import { format } from 'date-fns';

export type PartialMeeting = {
	name: string;
	createdAt: Date;
};

/**
 * Given a sorted list of meetings (oldest to newest), format them into a string like so:
 * @example
 * `January 2023
 * - Meeting 1
 * February 2023
 * - Meeting 2
 * - Meeting 3
 * March 2023
 * - Meeting 4
 * `
 * @returns newline separated string
 */
export function formatMeetingList(meetings: PartialMeeting[]): string {
	let output = '';
	let currentMonth: string | null = null;

	for (const meeting of meetings) {
		const meetingMonth = format(meeting.createdAt, 'MMMM yyyy');

		if (meetingMonth !== currentMonth) {
			// Add the month if it's different from the current one
			output += meetingMonth + '\n';
			currentMonth = meetingMonth;
		}

		// Add the meeting name
		output += `- ${meeting.name}\n`;
	}

	return output.trim();
}
