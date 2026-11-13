import {expect, test} from 'vitest';
import {getFilterCaptureSourceRect} from '../drawing/filter-capture-source-rect';

const shape = (rect: DOMRect | null) =>
	rect === null ? null : [rect.x, rect.y, rect.width, rect.height];

test('retains scaled offscreen input for a visible shadow', () => {
	expect(
		shape(
			getFilterCaptureSourceRect({
				sourceRect: new DOMRect(-100, 100, 200, 50),
				matrix: new DOMMatrix([2, 0, 0, 1, -50, 0]),
				viewport: new DOMRect(0, 0, 300, 300),
				filter: 'drop-shadow(150px 0 0 blue)',
			}),
		),
	).toEqual([-100, 100, 200, 50]);
});

test('retains the correct side of a reflected filter input', () => {
	expect(
		shape(
			getFilterCaptureSourceRect({
				sourceRect: new DOMRect(-100, 100, 200, 50),
				matrix: new DOMMatrix([-2, 0, 0, 1, 150, 0]),
				viewport: new DOMRect(0, 0, 300, 300),
				filter: 'drop-shadow(150px 0 0 blue)',
			}),
		),
	).toEqual([-100, 100, 175, 50]);
});

test('bounds large pointwise-filter captures to visible output', () => {
	expect(
		shape(
			getFilterCaptureSourceRect({
				sourceRect: new DOMRect(-10000, 100, 20000, 50),
				matrix: new DOMMatrix(),
				viewport: new DOMRect(0, 0, 300, 300),
				filter: 'brightness(1)',
			}),
		),
	).toEqual([0, 100, 300, 50]);
});

test('retains right-hand input for a negative shadow offset', () => {
	expect(
		shape(
			getFilterCaptureSourceRect({
				sourceRect: new DOMRect(-100, 0, 400, 100),
				matrix: new DOMMatrix(),
				viewport: new DOMRect(0, 0, 100, 100),
				filter: 'drop-shadow(-50px 0 0 blue)',
			}),
		),
	).toEqual([0, 0, 150, 100]);
});

test('rejects an entirely invisible declared output', () => {
	expect(
		getFilterCaptureSourceRect({
			sourceRect: new DOMRect(1000, 1000, 50, 50),
			matrix: new DOMMatrix(),
			viewport: new DOMRect(0, 0, 100, 100),
			filter: 'brightness(1)',
		}),
	).toBe(null);
});

test('retains complete inputs for visible reference filters', () => {
	expect(
		shape(
			getFilterCaptureSourceRect({
				sourceRect: new DOMRect(-10000, 0, 20000, 100),
				matrix: new DOMMatrix(),
				viewport: new DOMRect(0, 0, 300, 300),
				filter: 'url(#review-filter)',
			}),
		),
	).toEqual([-10000, 0, 20000, 100]);
});
