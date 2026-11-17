import type {InternalState} from '../internal-state';
import {getBackgroundImageRect} from './background-image-rect';
import {parseUrlFunction} from './mask-image';
import {
	createCanvasGradient,
	parseLinearGradient,
} from './parse-linear-gradient';
import {getRasterImage} from './raster-image-loader';

const createReadbackGradientPattern = ({
	target,
	gradientOptions,
	boundingRect,
}: {
	target: OffscreenCanvasRenderingContext2D;
	gradientOptions: Omit<Parameters<typeof createCanvasGradient>[0], 'ctx'>;
	boundingRect: DOMRect;
}) => {
	const matrix = target.getTransform();
	if (matrix.b !== 0 || matrix.c !== 0 || !(matrix.a > 0) || !(matrix.d > 0)) {
		return null;
	}

	const {offsetLeft, offsetTop} = gradientOptions;
	// Extend the gradient field past the destination edges. The existing
	// fillRect applies geometry and clipping once, in its original context.
	const left =
		Math.floor((boundingRect.left - offsetLeft) * matrix.a + matrix.e) - 1;
	const top =
		Math.floor((boundingRect.top - offsetTop) * matrix.d + matrix.f) - 1;
	const width =
		Math.ceil((boundingRect.right - offsetLeft) * matrix.a + matrix.e) +
		1 -
		left;
	const height =
		Math.ceil((boundingRect.bottom - offsetTop) * matrix.d + matrix.f) +
		1 -
		top;
	if (
		!(
			width > 0 &&
			height > 0 &&
			width <= 8192 &&
			height <= 8192 &&
			width * height <= 4 * 1024 * 1024
		)
	) {
		return null;
	}

	const paint = new OffscreenCanvas(width, height);
	using _paint = {
		[Symbol.dispose]: () => {
			paint.width = 0;
			paint.height = 0;
		},
	};
	const ctx = paint.getContext('2d', {willReadFrequently: true});
	if (!ctx) return null;
	ctx.setTransform(matrix.a, 0, 0, matrix.d, matrix.e - left, matrix.f - top);
	ctx.fillStyle = createCanvasGradient({ctx, ...gradientOptions});
	ctx.fillRect(
		(left - matrix.e) / matrix.a,
		(top - matrix.f) / matrix.d,
		width / matrix.a,
		height / matrix.d,
	);
	const pattern = target.createPattern(paint, 'no-repeat');
	pattern?.setTransform(matrix.inverse().translate(left, top));
	return pattern;
};

export const isColorTransparent = (color: string) => {
	return (
		color === 'transparent' ||
		(color.startsWith('rgba') &&
			(color.endsWith(', 0)') || color.endsWith(',0')))
	);
};

// Space repeats pin the first and last tiles to the positioning area. When
// fewer than two fit, CSS uses the positioned image once instead.
const getTilePositions = ({
	repeat,
	start,
	size,
	areaStart,
	areaSize,
	paintStart,
	paintEnd,
}: {
	repeat: string;
	start: number;
	size: number;
	areaStart: number;
	areaSize: number;
	paintStart: number;
	paintEnd: number;
}) => {
	const count = Math.floor(areaSize / size);
	if (repeat === 'no-repeat' || count < 2) return [start];
	const stride = (areaSize - size) / (count - 1);
	const origin = areaStart;
	const positions: number[] = [];
	let cursor = origin + Math.floor((paintStart - origin) / stride) * stride;
	for (; cursor < paintEnd; cursor += stride) {
		if (cursor + size > paintStart) positions.push(cursor);
	}

	return positions;
};

export const getBackgroundFill = async ({
	backgroundImage,
	backgroundPosition,
	backgroundSize,
	backgroundRepeat,
	internalState,
	positioningArea,
	contextToDraw,
	boundingRect,
	offsetLeft,
	offsetTop,
}: {
	backgroundImage: string;
	backgroundPosition: string;
	backgroundSize: string;
	backgroundRepeat: string;
	internalState: InternalState;
	positioningArea: DOMRect;
	contextToDraw: OffscreenCanvasRenderingContext2D;
	boundingRect: DOMRect;
	offsetLeft: number;
	offsetTop: number;
}): Promise<
	| CanvasGradient
	| CanvasPattern
	| {image: ImageBitmap; rects: Iterable<DOMRect>}
	| null
> => {
	if (backgroundImage && backgroundImage !== 'none') {
		const url = parseUrlFunction(backgroundImage);
		if (url !== null) {
			const image = await getRasterImage({
				src: url,
				state: internalState.rasterImageLoaderState,
				sourceProperty: 'background-image',
			});
			const rect = getBackgroundImageRect({
				backgroundPosition,
				backgroundSize,
				backgroundRepeat,
				positioningArea,
				intrinsicSize: image,
			});
			if (rect.width === 0 || rect.height === 0) return null;
			const [repeatX, repeatY = repeatX] = backgroundRepeat.split(/\s+/);
			if (repeatX === 'space' || repeatY === 'space') {
				if (
					![repeatX, repeatY].every((value) =>
						['space', 'no-repeat'].includes(value),
					)
				) {
					throw new Error(`Unsupported background-repeat: ${backgroundRepeat}`);
				}

				const xs = getTilePositions({
					repeat: repeatX,
					start: rect.left,
					size: rect.width,
					areaStart: positioningArea.left,
					areaSize: positioningArea.width,
					paintStart: boundingRect.left,
					paintEnd: boundingRect.right,
				});
				const ys = getTilePositions({
					repeat: repeatY,
					start: rect.top,
					size: rect.height,
					areaStart: positioningArea.top,
					areaSize: positioningArea.height,
					paintStart: boundingRect.top,
					paintEnd: boundingRect.bottom,
				});
				return {
					image,
					rects: (function* () {
						for (const x of xs) {
							for (const y of ys)
								yield new DOMRect(x, y, rect.width, rect.height);
						}
					})(),
				};
			}

			const repeatStyle = backgroundRepeat.replace(/round/g, 'repeat');
			const repetition =
				(
					{
						'repeat repeat': 'repeat',
						'no-repeat no-repeat': 'no-repeat',
						'repeat no-repeat': 'repeat-x',
						'no-repeat repeat': 'repeat-y',
					} as Record<string, string>
				)[repeatStyle] ?? repeatStyle;
			if (!['repeat', 'repeat-x', 'repeat-y', 'no-repeat'].includes(repetition))
				throw new Error(`Unsupported background-repeat: ${backgroundRepeat}`);
			// A single round tile with no overflow uses edge-clamped image sampling.
			if (
				repetition === 'no-repeat' ||
				((backgroundRepeat === 'round' || backgroundRepeat === 'round round') &&
					rect.width === positioningArea.width &&
					rect.height === positioningArea.height &&
					rect.left === positioningArea.left &&
					rect.top === positioningArea.top &&
					boundingRect.left === positioningArea.left &&
					boundingRect.top === positioningArea.top &&
					boundingRect.width === positioningArea.width &&
					boundingRect.height === positioningArea.height)
			)
				return {image, rects: [rect]};
			const pattern = contextToDraw.createPattern(image, repetition);
			if (!pattern)
				throw new Error('Could not create raster background pattern');
			pattern.setTransform(
				new DOMMatrix()
					.translate(rect.left - offsetLeft, rect.top - offsetTop)
					.scale(rect.width / image.width, rect.height / image.height),
			);
			return pattern;
		}

		const radialMatch = /^radial-gradient\((.*)\)$/.exec(backgroundImage);
		if (radialMatch) {
			const parts = radialMatch[1].split(/,(?![^(]*\))/);
			const firstPart = parts[0].trim();
			const hasShape =
				parseLinearGradient(`linear-gradient(${firstPart})`) === null;
			// Handle centered gradients with the default farthest-corner extent.
			// Other positions and explicit radii need their own geometry.
			if (
				!hasShape ||
				/^(?:(?:ellipse|circle)(?: farthest-corner)?|farthest-corner)?(?:\s*at (?:center|50% 50%))?$/.test(
					firstPart,
				)
			) {
				const stops = parseLinearGradient(
					`linear-gradient(${parts.slice(hasShape ? 1 : 0).join(',')})`,
				);
				if (stops) {
					const rect = getBackgroundImageRect({
						backgroundPosition,
						backgroundSize,
						positioningArea: boundingRect,
						intrinsicSize: null,
					});
					const circle = hasShape && firstPart.startsWith('circle');
					const radiusX = circle
						? Math.hypot(rect.width / 2, rect.height / 2)
						: (rect.width / 2) * Math.SQRT2;
					const radiusY = circle ? radiusX : (rect.height / 2) * Math.SQRT2;
					if (radiusX > 0 && radiusY > 0) {
						const canvas = new OffscreenCanvas(
							Math.ceil(rect.width),
							Math.ceil(rect.height),
						);
						const ctx = canvas.getContext('2d');
						if (!ctx) throw new Error('Could not get radial gradient context');
						ctx.translate(rect.width / 2, rect.height / 2);
						ctx.scale(radiusX, radiusY);
						const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
						for (const stop of stops.colorStops)
							gradient.addColorStop(stop.position, stop.color);
						ctx.fillStyle = gradient;
						ctx.fillRect(-1, -1, 2, 2);
						const pattern = contextToDraw.createPattern(canvas, 'no-repeat');
						pattern?.setTransform(
							new DOMMatrix().translate(
								rect.left - offsetLeft,
								rect.top - offsetTop,
							),
						);
						return pattern;
					}
				}
			}
		}

		const gradientInfo = parseLinearGradient(backgroundImage);
		if (gradientInfo) {
			const backgroundImageRect = getBackgroundImageRect({
				backgroundPosition,
				backgroundSize,
				positioningArea: boundingRect,
				intrinsicSize: null,
			});
			const gradientOptions = {
				rect: backgroundImageRect,
				gradientInfo,
				offsetLeft,
				offsetTop,
			};
			return (
				createReadbackGradientPattern({
					target: contextToDraw,
					boundingRect,
					gradientOptions,
				}) ?? createCanvasGradient({ctx: contextToDraw, ...gradientOptions})
			);
		}
	}

	return null;
};
