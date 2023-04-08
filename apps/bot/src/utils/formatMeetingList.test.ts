import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PartialMeeting } from './formatMeetingList.js';
import { formatMeetingList } from './formatMeetingList.js';

/** A mock list of 6 meetings from January 2022 to May 2023 */
const meetings: PartialMeeting[] = [
	{
		name: 'Oldest Meeting',
		createdAt: new Date(2022, 0, 1),
	},
	{
		name: 'Meeting 1',
		createdAt: new Date(2023, 0, 1),
	},
	{
		name: 'Meeting 2',
		createdAt: new Date(2023, 5, 1),
	},
	{
		name: 'Meeting 3',
		createdAt: new Date(2023, 5, 2),
	},
	{
		name: 'Meeting 4',
		createdAt: new Date(2023, 5, 4),
	},
	{
		name: 'Meeting 5',
		createdAt: new Date(2023, 5, 5),
	},
];

describe('formatMeetingList', () => {
	beforeAll(() => {
		vi.setSystemTime(new Date(2023, 5, 5));
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it('should format meeting list', () => {
		const output = formatMeetingList(meetings);
		const expectedOutput = `
**Today**
> - Meeting 5
**This week**
> - Meeting 4
**This month**
> - Meeting 3
> - Meeting 2
**This year**
> - Meeting 1
**Older**
> - Oldest Meeting
`.trim();

		expect(output).toBe(expectedOutput);
	});
});
