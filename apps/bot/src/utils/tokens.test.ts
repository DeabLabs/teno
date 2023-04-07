import { describe, expect, it } from 'vitest';

import { constrainLinesToTokenLimit } from './tokens.js';

describe('constrainLinesToTokenLimit', () => {
	it('should return the same array if it is under the max', () => {
		const lines = ['This is a test', 'This is another test'];

		const result = constrainLinesToTokenLimit(lines, 'This is a prompt', 20, 0);

		expect(result).toEqual(lines);
	});

	it('should return a shorter array if it is over the max', () => {
		const lines = ['This is a test', 'This is another test'];

		const result = constrainLinesToTokenLimit(lines, 'This is a prompt', 11, 0);

		const [, ...expectedResult] = lines;
		expect(result).toEqual(expectedResult);
	});

	it('should throw an error if maxTokens is less than responseTokens', () => {
		const lines = ['This is a test', 'This is another test'];

		expect(() => constrainLinesToTokenLimit(lines, 'This is a prompt', 10, 11)).toThrowError();
	});

	it('should return an empty array if the prompt is too long', () => {
		const lines = ['This is a test', 'This is another test'];

		const result = constrainLinesToTokenLimit(lines, 'This is a prompt longer longer longer', 10, 0);

		expect(result).toEqual([]);
	});
});
