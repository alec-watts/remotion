import type {DrawFn} from '../drawn-fn';
import {turnSvgIntoDrawable} from '../turn-svg-into-drawable';

const svgNamespace = 'http://www.w3.org/2000/svg';

const textProperties = [
	'color',
	'direction',
	'font-family',
	'font-feature-settings',
	'font-kerning',
	'font-optical-sizing',
	'font-size',
	'font-stretch',
	'font-style',
	'font-synthesis',
	'font-variant',
	'font-weight',
	'font-variation-settings',
	'hyphens',
	'letter-spacing',
	'line-break',
	'line-height',
	'overflow-wrap',
	'paint-order',
	'tab-size',
	'text-align',
	'text-align-last',
	'text-combine-upright',
	'text-decoration-color',
	'text-decoration-line',
	'text-decoration-skip-ink',
	'text-decoration-style',
	'text-decoration-thickness',
	'text-indent',
	'text-orientation',
	'text-rendering',
	'text-transform',
	'text-underline-offset',
	'text-underline-position',
	'unicode-bidi',
	'white-space',
	'word-break',
	'word-spacing',
	'writing-mode',
	'-webkit-text-fill-color',
	'-webkit-text-stroke',
] as const;

export const drawVerticalText = async ({
	span,
	parentRect,
	contextToDraw,
}: {
	span: HTMLSpanElement;
	parentRect: DOMRect;
	contextToDraw: Parameters<DrawFn>[0]['contextToDraw'];
}): Promise<boolean> => {
	const block = span.parentElement;
	if (!block || block.childNodes.length !== 1) {
		return false;
	}

	const style = getComputedStyle(block);
	if (
		style.display !== 'block' ||
		style.textShadow !== 'none' ||
		[
			style.paddingTop,
			style.paddingRight,
			style.paddingBottom,
			style.paddingLeft,
			style.borderTopWidth,
			style.borderRightWidth,
			style.borderBottomWidth,
			style.borderLeftWidth,
		].some((value) => value !== '0px')
	) {
		return false;
	}

	const rect = block.getBoundingClientRect();
	const matrix = contextToDraw.getTransform();
	const {width, height} = parentRect;
	if (
		rect.width <= 0 ||
		rect.height <= 0 ||
		width <= 0 ||
		height <= 0 ||
		matrix.a <= 0 ||
		matrix.a !== matrix.d ||
		matrix.b !== 0 ||
		matrix.c !== 0 ||
		matrix.e !== 0 ||
		matrix.f !== 0
	) {
		return false;
	}

	const document = block.ownerDocument;
	const range = document.createRange();
	range.selectNodeContents(span);
	const textRect = range.getBoundingClientRect();
	const padding = Math.max(
		parseFloat(style.fontSize),
		parseFloat(style.lineHeight) || 0,
	);
	// Keep the image origin aligned to both the SVG and output pixel grids.
	const grid = [1, 2, 3, 4, 5, 6, 7, 8].find((step) =>
		Number.isInteger(step * matrix.a),
	);
	const left = grid
		? Math.max(
				0,
				Math.floor(
					(Math.min(rect.left, textRect.left) - parentRect.left - padding) /
						grid,
				) * grid,
			)
		: 0;
	const top = grid
		? Math.max(
				0,
				Math.floor(
					(Math.min(rect.top, textRect.top) - parentRect.top - padding) / grid,
				) * grid,
			)
		: 0;
	const right = grid
		? Math.min(
				width,
				Math.ceil(
					(Math.max(rect.right, textRect.right) - parentRect.left + padding) /
						grid,
				) * grid,
			)
		: width;
	const bottom = grid
		? Math.min(
				height,
				Math.ceil(
					(Math.max(rect.bottom, textRect.bottom) - parentRect.top + padding) /
						grid,
				) * grid,
			)
		: height;
	const cropWidth = right - left;
	const cropHeight = bottom - top;
	if (cropWidth <= 0 || cropHeight <= 0) {
		return false;
	}

	const svg = document.createElementNS(svgNamespace, 'svg');
	svg.setAttribute('width', String(cropWidth));
	svg.setAttribute('height', String(cropHeight));
	if (cropWidth !== width || cropHeight !== height) {
		svg.setAttribute('viewBox', `${left} ${top} ${cropWidth} ${cropHeight}`);
	}

	svg.style.cssText =
		'position: fixed; left: -100000px; top: 0; pointer-events: none;';
	const carrier = document.createElementNS(svgNamespace, 'foreignObject');
	carrier.setAttribute('width', String(width));
	carrier.setAttribute('height', String(height));
	const viewport = document.createElement('div');
	viewport.style.position = 'relative';
	viewport.style.width = `${width}px`;
	viewport.style.height = `${height}px`;
	const textBlock = document.createElement('div');
	const language = block.closest('[lang]')?.getAttribute('lang');
	if (language !== null && language !== undefined) {
		textBlock.lang = language;
	}

	for (const property of textProperties) {
		textBlock.style.setProperty(property, style.getPropertyValue(property));
	}

	textBlock.style.position = 'absolute';
	textBlock.style.left = `${rect.x - parentRect.x}px`;
	textBlock.style.top = `${rect.y - parentRect.y}px`;
	textBlock.style.width = `${rect.width}px`;
	textBlock.style.height = `${rect.height}px`;
	textBlock.textContent = span.textContent;
	viewport.append(textBlock);
	carrier.append(viewport);
	svg.append(carrier);
	document.body.append(svg);
	let image: Promise<HTMLImageElement>;
	try {
		image = turnSvgIntoDrawable(svg);
	} finally {
		svg.remove();
	}

	contextToDraw.drawImage(await image, left, top, cropWidth, cropHeight);
	return true;
};
