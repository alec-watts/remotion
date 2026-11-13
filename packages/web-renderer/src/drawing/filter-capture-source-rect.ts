import {parseFilterOutsets} from './filter-outsets';
import {clipSourceRectToViewport} from './get-pretransform-rect';

export const getFilterCaptureSourceRect = ({
	sourceRect,
	matrix,
	viewport,
	filter,
}: {
	sourceRect: DOMRect;
	matrix: DOMMatrix;
	viewport: DOMRect;
	filter: string;
}) => {
	// Clip the declared filter output first, then recover its input dependencies
	// in local filter coordinates. Inputs may lie outside the output viewport.
	const visibleOutput = clipSourceRectToViewport(sourceRect, matrix, viewport);
	if (visibleOutput === null) return null;
	// Reference filters may read arbitrary regions of the source graphic.
	if (filter.includes('url(')) return sourceRect;
	const outsets = parseFilterOutsets(filter);
	const left = Math.max(sourceRect.left, visibleOutput.left - outsets.right);
	const top = Math.max(sourceRect.top, visibleOutput.top - outsets.bottom);
	const right = Math.min(sourceRect.right, visibleOutput.right + outsets.left);
	const bottom = Math.min(
		sourceRect.bottom,
		visibleOutput.bottom + outsets.top,
	);
	return new DOMRect(left, top, right - left, bottom - top);
};
