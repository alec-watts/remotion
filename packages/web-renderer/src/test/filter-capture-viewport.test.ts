import {expect, test} from 'vitest';
import {getFilterCaptureViewport} from '../drawing/filter-capture-viewport';

test.each([
	{
		affine: [1, 0, 0, 1],
		filter: 'drop-shadow(150px 0px 0px blue)',
		expected: [-150, 0, 450, 300],
	},
	{
		affine: [2, 0, 0, 1],
		filter: 'drop-shadow(150px 0px 0px blue)',
		expected: [-300, 0, 600, 300],
	},
	{
		affine: [-2, 0, 0, 1],
		filter: 'drop-shadow(150px 0px 0px blue)',
		expected: [0, 0, 600, 300],
	},
	{
		affine: [0, 1, -1, 0],
		filter: 'drop-shadow(150px 0px 0px blue)',
		expected: [0, -150, 300, 450],
	},
	{
		affine: [1, 0, 1, 1],
		filter: 'drop-shadow(0px 100px 0px blue)',
		expected: [-100, -100, 400, 400],
	},
	{
		affine: [2, 0, 0, 0.5],
		filter: 'blur(10px)',
		expected: [-60, -15, 420, 330],
	},
])(
	'maps local filter dependencies through affine $affine',
	({affine, filter, expected}) => {
		const [a, b, c, d] = affine;
		const actual = getFilterCaptureViewport({
			viewport: new DOMRect(0, 0, 300, 300),
			filter,
			matrix: {is2D: true, a, b, c, d},
		});
		expect([actual.left, actual.top, actual.width, actual.height]).toEqual(
			expected,
		);
	},
);

test('retains the existing projective fallback pending projected filter qualification', () => {
	const actual = getFilterCaptureViewport({
		viewport: new DOMRect(0, 0, 300, 300),
		filter: 'drop-shadow(150px 0px 0px blue)',
		matrix: {is2D: false, a: 2, b: 0, c: 0, d: 1},
	});
	expect([actual.left, actual.top, actual.width, actual.height]).toEqual([
		-150, 0, 450, 300,
	]);
});
