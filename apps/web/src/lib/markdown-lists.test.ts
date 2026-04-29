import { describe, expect, it } from 'vitest';
import { orderedListMarkersForLines } from './markdown-lists';

describe('ordered list markers', () => {
	it('uses the first source marker as the start number for nested ordered lists', () => {
		const markers = orderedListMarkersForLines([
			'1. Parent',
			'   2. Child',
			'   3. Child',
			'2. Parent',
			'   4. Child'
		]);

		expect(Array.from(markers.entries())).toEqual([
			[1, '1.'],
			[2, '2.'],
			[3, '3.'],
			[4, '2.'],
			[5, '4.']
		]);
	});

	it('uses the first source marker as the start number for top-level ordered lists', () => {
		const markers = orderedListMarkersForLines([
			'3. Start',
			'4. Next',
			'   9. Nested'
		]);

		expect(Array.from(markers.entries())).toEqual([
			[1, '3.'],
			[2, '4.'],
			[3, '9.']
		]);
	});
});
