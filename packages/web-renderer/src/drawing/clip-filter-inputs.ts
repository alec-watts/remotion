import {parseFilterOutsets} from './filter-outsets';
import {clipPolygonToHalfPlanes} from './get-pretransform-rect';

export const clipFilterInputs = ({
	rect,
	matrix,
	viewport,
	filter,
}: {
	rect: DOMRect;
	matrix: DOMMatrix;
	viewport: DOMRect;
	filter: string;
}) => {
	const outsets = parseFilterOutsets(filter);
	const planes = [
		[matrix.m14, matrix.m24, matrix.m44 - 1e-7],
		[
			matrix.m11 - viewport.left * matrix.m14,
			matrix.m21 - viewport.left * matrix.m24,
			matrix.m41 - viewport.left * matrix.m44,
		],
		[
			viewport.right * matrix.m14 - matrix.m11,
			viewport.right * matrix.m24 - matrix.m21,
			viewport.right * matrix.m44 - matrix.m41,
		],
		[
			matrix.m12 - viewport.top * matrix.m14,
			matrix.m22 - viewport.top * matrix.m24,
			matrix.m42 - viewport.top * matrix.m44,
		],
		[
			viewport.bottom * matrix.m14 - matrix.m12,
			viewport.bottom * matrix.m24 - matrix.m22,
			viewport.bottom * matrix.m44 - matrix.m42,
		],
	];
	const polygon = clipPolygonToHalfPlanes(
		[
			{x: rect.left, y: rect.top},
			{x: rect.right, y: rect.top},
			{x: rect.right, y: rect.bottom},
			{x: rect.left, y: rect.bottom},
		],
		planes.map(([a, b, c]) => {
			const support =
				Math.max(-a * outsets.left, a * outsets.right) +
				Math.max(-b * outsets.top, b * outsets.bottom);
			return (point: {x: number; y: number}) =>
				a * point.x + b * point.y + c + support;
		}),
	);
	if (!polygon.length) return null;
	const xs = polygon.map((point) => point.x);
	const ys = polygon.map((point) => point.y);
	return new DOMRect(
		Math.min(...xs),
		Math.min(...ys),
		Math.max(...xs) - Math.min(...xs),
		Math.max(...ys) - Math.min(...ys),
	);
};
