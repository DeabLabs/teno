import { describe, expect, it } from 'vitest';

import type { PartialMeeting } from './formatMeetingList.js';
import { formatMeetingList } from './formatMeetingList.js';

/** A mock list of 4 meetings from January to March */
const meetings: PartialMeeting[] = [
	{
		name: 'Meeting 1',
		createdAt: new Date(2023, 0, 1),
	},
	{
		name: 'Meeting 2',
		createdAt: new Date(2023, 1, 2),
	},
	{
		name: 'Meeting 3',
		createdAt: new Date(2023, 1, 3),
	},
	{
		name: 'Meeting 4',
		createdAt: new Date(2023, 2, 4),
	},
];

describe('formatMeetingList', () => {
	it('should format meeting list', () => {
		const output = formatMeetingList(meetings);
		const expectedOutput = `
January 2023
- Meeting 1
February 2023
- Meeting 2
- Meeting 3
March 2023
- Meeting 4
`.trim();

		console.log(output);
		console.log(expectedOutput);

		expect(output).toBe(expectedOutput);
	});
});
