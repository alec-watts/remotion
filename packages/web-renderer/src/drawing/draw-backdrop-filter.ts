import {parseBorderRadius} from './border-radius';
import {drawRoundedRectPath} from './draw-rounded';
import {scaleFilterLengths} from './handle-filter';
import {setTransform} from './transform';
import {transformDOMRect} from './transform-rect-with-matrix';

const makeAxisBlur = ({
	ownerDocument,
	width,
	height,
	sigmaX,
	sigmaY,
}: {
	ownerDocument: Document;
	width: number;
	height: number;
	sigmaX: number;
	sigmaY: number;
}) => {
	const ns = 'http://www.w3.org/2000/svg';
	const svg = ownerDocument.createElementNS(ns, 'svg');
	svg.setAttribute('width', '0');
	svg.setAttribute('height', '0');
	svg.style.position = 'absolute';
	const filter = ownerDocument.createElementNS(ns, 'filter');
	filter.id = `remotion-backdrop-blur-${crypto.randomUUID()}`;
	filter.setAttribute('filterUnits', 'userSpaceOnUse');
	filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
	filter.setAttribute('color-interpolation-filters', 'sRGB');
	filter.setAttribute('x', '0');
	filter.setAttribute('y', '0');
	filter.setAttribute('width', String(width));
	filter.setAttribute('height', String(height));
	const blur = ownerDocument.createElementNS(ns, 'feGaussianBlur');
	blur.setAttribute('stdDeviation', `${sigmaX} ${sigmaY}`);
	filter.append(blur);
	svg.append(filter);
	ownerDocument.body.append(svg);

	return {filter: `url(#${filter.id})`, [Symbol.dispose]: () => svg.remove()};
};

const mirrorBackdrop = ({
	source,
	left,
	top,
	width,
	height,
	padding,
}: {
	source: OffscreenCanvas;
	left: number;
	top: number;
	width: number;
	height: number;
	padding: number;
}) => {
	const input = new OffscreenCanvas(width + 2 * padding, height + 2 * padding);
	const dispose = () => {
		input.width = 0;
		input.height = 0;
	};

	try {
		const ctx = input.getContext('2d');
		if (!ctx) {
			dispose();
			return null;
		}

		ctx.imageSmoothingEnabled = false;
		// The middle tile is the original border box. Its neighbors repeat that
		// box with alternate axes flipped, including at the corners.
		for (const row of [-1, 0, 1]) {
			for (const column of [-1, 0, 1]) {
				ctx.setTransform(
					column === 0 ? 1 : -1,
					0,
					0,
					row === 0 ? 1 : -1,
					padding + (column === 1 ? 2 * width : 0),
					padding + (row === 1 ? 2 * height : 0),
				);
				ctx.drawImage(source, left, top, width, height, 0, 0, width, height);
			}
		}

		return {input, [Symbol.dispose]: dispose};
	} catch (error) {
		dispose();
		throw error;
	}
};

export const drawBackdropFilter = ({
	source,
	destination,
	filter,
	dimensions,
	layerRect,
	parentRect,
	totalMatrix,
	scale,
	layerScale,
	borderRadius,
	ownerDocument,
}: {
	source: OffscreenCanvas;
	destination: OffscreenCanvasRenderingContext2D;
	filter: string;
	dimensions: DOMRect;
	layerRect: DOMRect | null;
	parentRect: DOMRect;
	totalMatrix: DOMMatrix;
	scale: number;
	layerScale: number;
	borderRadius: string;
	ownerDocument: Document;
}) => {
	if (!totalMatrix.is2D || filter.includes('url(')) return;
	const inverse = totalMatrix.inverse();
	if (!Number.isFinite(inverse.a)) return;

	const bitmapFilter = scaleFilterLengths(filter, scale);
	const sigma = Number(/^blur\(([\d.]+)px\)$/.exec(bitmapFilter)?.[1] ?? 0);
	const axisScaled =
		sigma > 0 &&
		totalMatrix.b === 0 &&
		totalMatrix.c === 0 &&
		(Math.abs(totalMatrix.a) !== 1 || Math.abs(totalMatrix.d) !== 1);
	const sigmaX = axisScaled ? sigma * Math.abs(totalMatrix.a) : sigma;
	const sigmaY = axisScaled ? sigma * Math.abs(totalMatrix.d) : sigma;
	const padding = Math.ceil(4 * Math.max(sigma, sigmaX, sigmaY));
	let sourceLeft = 0;
	let sourceTop = 0;
	let cropWidth = 0;
	let cropHeight = 0;
	if (padding > 0 && totalMatrix.b === 0 && totalMatrix.c === 0) {
		const bounds = transformDOMRect({rect: dimensions, matrix: totalMatrix});
		sourceLeft = Math.max(
			0,
			Math.floor((bounds.left - parentRect.left) * scale),
		);
		sourceTop = Math.max(0, Math.floor((bounds.top - parentRect.top) * scale));
		cropWidth =
			Math.min(
				source.width,
				Math.ceil((bounds.right - parentRect.left) * scale),
			) - sourceLeft;
		cropHeight =
			Math.min(
				source.height,
				Math.ceil((bounds.bottom - parentRect.top) * scale),
			) - sourceTop;
	}

	const paddedWidth = cropWidth + 2 * padding;
	const paddedHeight = cropHeight + 2 * padding;
	using mirrored =
		padding > 0 &&
		cropWidth >= padding &&
		cropHeight >= padding &&
		paddedWidth <= 8192 &&
		paddedHeight <= 8192 &&
		paddedWidth * paddedHeight <= 16 * 1024 * 1024
			? mirrorBackdrop({
					source,
					left: sourceLeft,
					top: sourceTop,
					width: cropWidth,
					height: cropHeight,
					padding,
				})
			: null;
	const input = mirrored?.input ?? source;
	using axisBlur =
		mirrored && axisScaled
			? makeAxisBlur({
					ownerDocument,
					width: input.width,
					height: input.height,
					sigmaX,
					sigmaY,
				})
			: null;
	// Canvas's blur() accepts a single radius. A document-backed SVG filter can
	// apply both projected standard deviations without resampling the input.
	const backdrop = axisBlur
		? ownerDocument.createElement('canvas')
		: new OffscreenCanvas(input.width, input.height);
	if (axisBlur) {
		backdrop.width = input.width;
		backdrop.height = input.height;
	}

	using _backdrop = {
		[Symbol.dispose]: () => {
			backdrop.width = 0;
			backdrop.height = 0;
		},
	};
	const backdropContext = backdrop.getContext('2d');
	if (!backdropContext || typeof backdropContext.filter !== 'string') return;
	backdropContext.filter = axisBlur?.filter ?? bitmapFilter;
	if (axisBlur && backdropContext.filter === 'none') {
		backdropContext.filter = bitmapFilter;
	}

	if (backdropContext.filter === 'none') return;
	backdropContext.drawImage(input, 0, 0);

	// Filter the painted backdrop in the parent bitmap's coordinate system.
	// Map it back to the element's group before applying group opacity or effects.
	destination.save();
	try {
		const clipOrigin = layerRect ?? parentRect;
		if (layerRect) {
			destination.setTransform(layerScale, 0, 0, layerScale, 0, 0);
		} else {
			setTransform({
				ctx: destination,
				transform: totalMatrix,
				parentRect,
				scale,
			});
		}

		const x = dimensions.left - clipOrigin.left;
		const y = dimensions.top - clipOrigin.top;
		const radii = parseBorderRadius({
			borderRadius,
			width: dimensions.width,
			height: dimensions.height,
		});
		const corners = [
			radii.topLeft,
			radii.topRight,
			radii.bottomRight,
			radii.bottomLeft,
		];
		if (
			typeof destination.roundRect === 'function' &&
			corners.some((corner) => corner.horizontal !== 0 || corner.vertical !== 0)
		) {
			destination.beginPath();
			destination.roundRect(
				x,
				y,
				dimensions.width,
				dimensions.height,
				corners.map(({horizontal, vertical}) => ({x: horizontal, y: vertical})),
			);
		} else {
			drawRoundedRectPath({
				ctx: destination,
				x,
				y,
				width: dimensions.width,
				height: dimensions.height,
				borderRadius: radii,
			});
		}

		destination.clip();
		if (layerRect) {
			destination.setTransform(
				new DOMMatrix()
					.scale(layerScale)
					.translate(-layerRect.left, -layerRect.top)
					.multiply(inverse)
					.translate(parentRect.left, parentRect.top)
					.scale(1 / scale),
			);
		} else {
			destination.resetTransform();
		}

		destination.globalAlpha = 1;
		destination.globalCompositeOperation = layerRect
			? 'destination-over'
			: 'source-over';
		destination.filter = 'none';
		destination.drawImage(
			backdrop,
			mirrored ? sourceLeft - padding : 0,
			mirrored ? sourceTop - padding : 0,
		);
	} finally {
		destination.restore();
	}
};
