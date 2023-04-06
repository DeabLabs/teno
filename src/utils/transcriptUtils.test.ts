import { describe, expect, it } from 'vitest';

import { makeTranscriptKey, formatTime } from './transcriptUtils.js';

describe('makeTranscriptKey', () => {
	it('should return a key with the correct format', () => {
		const key = makeTranscriptKey('123', '456', '789');

		expect(key).toBe('123-456-789');
	});
});

describe('formatTime', () => {
	it('should return 00:00 if seconds is NaN', () => {
		const time = formatTime(NaN);

		expect(time).toBe('00:00');
	});

	it('should return 00:00 if seconds is 0', () => {
		const time = formatTime(0);

		expect(time).toBe('00:00');
	});

	it('should return 00:00 if seconds is less than 0', () => {
		const time = formatTime(-1);

		expect(time).toBe('00:00');
	});

	it('should return 00:10 if seconds is 10', () => {
		const time = formatTime(10);

		expect(time).toBe('00:10');
	});

	it('should return 00:10 if seconds is 10.5', () => {
		const time = formatTime(10.5);

		expect(time).toBe('00:10');
	});

	it('should return 01:00 if seconds is 60', () => {
		const time = formatTime(60);

		expect(time).toBe('01:00');
	});

	it('should return 1:00:00 if seconds is 3600', () => {
		const time = formatTime(3600);

		expect(time).toBe('01:00:00');
	});
});
