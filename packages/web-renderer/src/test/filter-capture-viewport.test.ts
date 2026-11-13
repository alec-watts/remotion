import {expect, test} from 'vitest';
import {getFilterCaptureViewport} from '../drawing/filter-capture-viewport';
import {getPrecomposedLayerGeometry} from '../drawing/get-precomposed-layer-geometry';
import {clipSourceRectToViewport} from '../drawing/get-pretransform-rect';

const viewport = () => new DOMRect(0, 0, 300, 300);
const matrix = (a = 1, b = 0, c = 0, d = 1) => ({is2D: true, a, b, c, d});
const rectangle = (rect: DOMRect) => [rect.x, rect.y, rect.width, rect.height];

test.each([
	{matrix: matrix(), expected: [-150, 0, 450, 300]},
	{matrix: matrix(2), expected: [-300, 0, 600, 300]},
	{matrix: matrix(-2), expected: [0, 0, 600, 300]},
	{matrix: matrix(0, 1, -1, 0), expected: [0, -150, 300, 450]},
])('retains local shadow inputs under affine transform $expected', (entry) => {
	expect(
		rectangle(
			getFilterCaptureViewport({
				viewport: viewport(),
				filter: 'drop-shadow(150px 0px 0px rgb(0, 0, 255))',
				matrix: entry.matrix,
			}),
		),
	).toEqual(entry.expected);
});

test.each([2, -2])(
	'captures filtered axis scale %s before final resampling',
	(a) => {
		const result = getPrecomposedLayerGeometry({
			precomposeRect: new DOMRect(-100, 100, 200, 50),
			totalMatrix: matrix(a) as DOMMatrix,
			parentRect: viewport(),
			scale: 1,
			is3DPrecomposition: false,
			rasterizeFilterAtProjectedScale: true,
		});
		expect(result.scale).toBe(2);
		expect(rectangle(result.rect)).toEqual([-100, 100, 200, 50]);
	},
);

test('leaves the default and perspective sampling policies unchanged', () => {
	const options = {
		precomposeRect: new DOMRect(-100, 100, 200, 50),
		totalMatrix: matrix(2) as DOMMatrix,
		parentRect: viewport(),
		scale: 1,
		is3DPrecomposition: false,
	};
	expect(getPrecomposedLayerGeometry(options).scale).toBe(1);
	expect(
		getPrecomposedLayerGeometry({
			...options,
			is3DPrecomposition: true,
			rasterizeFilterAtProjectedScale: true,
		}).scale,
	).toBe(1);
});

test('retains both axes of a skewed vertical shadow', () => {
	expect(
		rectangle(
			getFilterCaptureViewport({
				viewport: viewport(),
				filter: 'drop-shadow(0px 100px 0px blue)',
				matrix: matrix(1, 0, 1, 1),
			}),
		),
	).toEqual([-100, -100, 400, 400]);
});

test('transforms blur extents independently in each output axis', () => {
	expect(
		rectangle(
			getFilterCaptureViewport({
				viewport: viewport(),
				filter: 'blur(10px)',
				matrix: matrix(2, 0, 0, 3),
			}),
		),
	).toEqual([-60, -90, 420, 480]);
});

test('does not apply an affine footprint rule to a perspective matrix', () => {
	expect(
		rectangle(
			getFilterCaptureViewport({
				viewport: viewport(),
				filter: 'drop-shadow(150px 0px 0px blue)',
				matrix: {...matrix(2), is2D: false},
			}),
		),
	).toEqual([-150, 0, 450, 300]);
});

test('retains the source of the reviewer blue shadow instead of clipping it before filtering', () => {
	const retained = getFilterCaptureViewport({
		viewport: viewport(),
		filter: 'drop-shadow(150px 0px 0px blue)',
		matrix: matrix(2),
	});
	// The source projects to [-250, -150]; its 150-local-pixel shadow shifts
	// 300 output pixels and reaches [50, 150], including the review sample x=75.
	expect(retained.left).toBeLessThanOrEqual(-250);
	expect(retained.right).toBeGreaterThanOrEqual(-150);
	const source = new DOMRect(-100, 100, 50, 50);
	const projection = {
		m11: 2,
		m21: 0,
		m41: -50,
		m12: 0,
		m22: 1,
		m42: 0,
		m14: 0,
		m24: 0,
		m44: 1,
	} as DOMMatrix;
	expect(clipSourceRectToViewport(source, projection, retained)?.width).toBe(
		50,
	);
	expect(
		clipSourceRectToViewport(source, projection, new DOMRect(-150, 0, 450, 300))
			?.width ?? 0,
	).toBe(0);
});
