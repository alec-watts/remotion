import {parseBorderRadius} from './border-radius';
import {drawRoundedRectPath} from './draw-rounded';
import {scaleFilterLengths} from './handle-filter';
import {setTransform} from './transform';
import {transformDOMRect} from './transform-rect-with-matrix';

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
}) => {
	if (!totalMatrix.is2D || filter.includes('url(')) return;
	const inverse = totalMatrix.inverse();
	if (!Number.isFinite(inverse.a)) return;

	const bitmapFilter = scaleFilterLengths(filter, scale);
	const blur = /^blur\(([\d.]+)px\)$/.exec(bitmapFilter);
	const padding = blur ? Math.ceil(4 * Number(blur[1])) : 0;
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
	const backdrop = new OffscreenCanvas(input.width, input.height);
	using _backdrop = {
		[Symbol.dispose]: () => {
			backdrop.width = 0;
			backdrop.height = 0;
		},
	};
	const backdropContext = backdrop.getContext('2d');
	if (!backdropContext || typeof backdropContext.filter !== 'string') return;
	backdropContext.filter = bitmapFilter;
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
