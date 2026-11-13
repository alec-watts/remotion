import {parseFilterOutsets} from './filter-outsets';

export const getFilterCaptureViewport = ({
	viewport,
	filter,
	matrix,
}: {
	viewport: DOMRect;
	filter: string;
	matrix: Pick<DOMMatrix, 'is2D' | 'a' | 'b' | 'c' | 'd'>;
}) => {
	const outsets = parseFilterOutsets(filter);
	if (!matrix.is2D) {
		return new DOMRect(
			viewport.left - outsets.right,
			viewport.top - outsets.bottom,
			viewport.width + outsets.left + outsets.right,
			viewport.height + outsets.top + outsets.bottom,
		);
	}

	// The filter footprint is local; the viewport is in output coordinates.
	// Bound its affine image before reversing the visible output dependency.
	const xs = [-outsets.left, outsets.right];
	const ys = [-outsets.top, outsets.bottom];
	const displacements = xs.flatMap((x) =>
		ys.map((y) => ({
			x: matrix.a * x + matrix.c * y,
			y: matrix.b * x + matrix.d * y,
		})),
	);
	const left = viewport.left - Math.max(...displacements.map((p) => p.x));
	const right = viewport.right - Math.min(...displacements.map((p) => p.x));
	const top = viewport.top - Math.max(...displacements.map((p) => p.y));
	const bottom = viewport.bottom - Math.min(...displacements.map((p) => p.y));
	return new DOMRect(left, top, right - left, bottom - top);
};
