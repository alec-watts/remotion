import {getBiggestBoundingClientRect} from '../get-biggest-bounding-client-rect';
import {splitAtTopLevel} from './background-image-rect';
import {getWiderRectAndExpand} from './clamp-rect-to-parent-bounds';
import {parseFilterOutsets} from './filter-outsets';
import {getSvgFilterGeometry, rebaseSvgFilter} from './svg-filter-geometry';

/**
 * Gets the precompose rect for an element with a filter that requires precompositing.
 * Expands the element's bounding rect (including all children) to accommodate drop-shadow spread.
 */
export const getPrecomposeRectForFilter = ({
	element,
	filter,
}: {
	element: HTMLElement | SVGElement;
	filter: string;
}): DOMRect => {
	// Use getBiggestBoundingClientRect to include all children that may overflow
	const elementRect = getBiggestBoundingClientRect(element);
	const expansion = parseFilterOutsets(filter);
	const bounds = element.getBoundingClientRect();
	const geometry = getSvgFilterGeometry({
		filter,
		ownerDocument: element.ownerDocument,
		width: bounds.width,
		height: bounds.height,
	});
	if (geometry) {
		return getWiderRectAndExpand({
			firstRect: elementRect,
			secondRect: new DOMRect(
				bounds.left + geometry.rect.left,
				bounds.top + geometry.rect.top,
				geometry.rect.width,
				geometry.rect.height,
			),
		});
	}

	return new DOMRect(
		elementRect.left - expansion.left,
		elementRect.top - expansion.top,
		elementRect.width + expansion.left + expansion.right,
		elementRect.height + expansion.top + expansion.bottom,
	);
};

/**
 * Applies a filter when drawing a precomposed canvas to the main context.
 */
export const applyFilterToDrawOperation = ({
	context,
	filter,
	drawFn,
}: {
	context: OffscreenCanvasRenderingContext2D;
	filter: string;
	drawFn: () => void;
}) => {
	const previousFilter = context.filter;
	context.filter = filter;
	drawFn();
	context.filter = previousFilter;
};

let paintsCanvasDropShadow: boolean | null = null;

const canvasPaintsDropShadow = () => {
	if (paintsCanvasDropShadow !== null) return paintsCanvasDropShadow;
	const probe = new OffscreenCanvas(3, 1);
	try {
		const context = probe.getContext('2d');
		if (!context) return false;
		context.filter = 'drop-shadow(1px 0px 0px black)';
		context.fillRect(0, 0, 1, 1);
		paintsCanvasDropShadow = context.getImageData(1, 0, 1, 1).data[3] === 255;
		return paintsCanvasDropShadow;
	} finally {
		probe.width = 0;
		probe.height = 0;
	}
};

export const applySharpShadowFallback = (
	context: OffscreenCanvasRenderingContext2D,
	filter: string,
): boolean => {
	const operations = splitAtTopLevel(filter, ' ');
	const operation = operations[0];
	if (operations.length !== 1 || !operation.startsWith('drop-shadow(')) {
		return false;
	}

	const tokens = splitAtTopLevel(operation.slice(12, -1), ' ');
	const isLength = (value: string) => /^[+-]?\d+(?:\.\d+)?px$/.test(value);
	const lengths = tokens.filter(isLength).map((value) => parseFloat(value));
	const colors = tokens.filter((value) => !isLength(value));
	const [offsetX, offsetY, blurRadius = 0] = lengths;
	if (
		lengths.length < 2 ||
		lengths.length > 3 ||
		colors.length !== 1 ||
		!Number.isInteger(offsetX) ||
		!Number.isInteger(offsetY) ||
		blurRadius !== 0 ||
		(offsetX === 0 && offsetY === 0) ||
		canvasPaintsDropShadow()
	) {
		return false;
	}

	const {width, height} = context.canvas;
	if (width > 16384 || height > 16384 || width * height > 16777216) {
		return false;
	}

	const scratch = new OffscreenCanvas(width, height);
	try {
		const target = scratch.getContext('2d');
		if (!target) return false;
		target.shadowColor = colors[0];
		target.shadowOffsetX = offsetX;
		target.shadowOffsetY = offsetY;
		target.drawImage(context.canvas, 0, 0);
		context.drawImage(scratch, 0, 0);
		return true;
	} finally {
		scratch.width = 0;
		scratch.height = 0;
	}
};

// Canvas filter lengths use bitmap pixels independently of the context transform.
export const scaleFilterLengths = (filter: string, scale: number) => {
	if (scale === 1) return filter;
	return splitAtTopLevel(filter, ' ')
		.map((operation) =>
			operation.startsWith('url(')
				? operation
				: operation.replace(
						/([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)px/gi,
						(_, value: string) => `${Number(value) * scale}px`,
					),
		)
		.join(' ');
};

// OffscreenCanvas cannot resolve DOM SVG filter references. Use a document-backed
// surface only for this filter stage, then feed it into the existing group draw.
export const applySvgFilterToPrecomposedCanvas = ({
	source,
	sourceRect,
	scale,
	filter,
	ownerDocument,
}: {
	source: OffscreenCanvas;
	sourceRect: DOMRect;
	scale: number;
	filter: string;
	ownerDocument: Document;
}) => {
	// Only graphs with qualified geometry use this document-backed stage.
	// Leave other URL filters on the existing draw path without cropping input.
	const geometry = getSvgFilterGeometry({
		filter,
		ownerDocument,
		width: sourceRect.width / scale,
		height: sourceRect.height / scale,
	});
	if (!geometry) return null;
	const rebased = rebaseSvgFilter({geometry, scale, ownerDocument});
	const canvas = ownerDocument.createElement('canvas');
	canvas.width = rebased.width;
	canvas.height = rebased.height;
	const dispose = () => {
		rebased[Symbol.dispose]();
		canvas.width = 0;
		canvas.height = 0;
	};

	try {
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Could not get SVG filter context');
		context.filter = rebased.filter;
		context.drawImage(
			source,
			-sourceRect.left - rebased.left,
			-sourceRect.top - rebased.top,
		);
	} catch (error) {
		dispose();
		throw error;
	}

	return {
		canvas,
		sourceX: -sourceRect.left - rebased.left,
		sourceY: -sourceRect.top - rebased.top,
		[Symbol.dispose]: dispose,
	};
};
