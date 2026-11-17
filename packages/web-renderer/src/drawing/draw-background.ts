import type {LogLevel} from 'remotion';
import type {InternalState} from '../internal-state';
import {createLayer} from '../take-screenshot';
import {getBlendMode} from './calculate-transforms';
import {getBackgroundFill, isColorTransparent} from './get-background-fill';
import {getBoxBasedOnBackgroundClip} from './get-padding-box';
import {parseUrlFunction} from './mask-image';

export const drawBackground = async ({
	hasCssTransform,
	backgroundImage,
	context,
	rect,
	backgroundColor,
	backgroundClip,
	element,
	logLevel,
	internalState,
	computedStyle,
	offsetLeft: parentOffsetLeft,
	offsetTop: parentOffsetTop,
	scale,
}: {
	hasCssTransform: boolean;
	backgroundImage: string;
	context: OffscreenCanvasRenderingContext2D;
	rect: DOMRect;
	backgroundColor: string;
	backgroundClip: string;
	element: HTMLElement | SVGElement;
	logLevel: LogLevel;
	internalState: InternalState;
	computedStyle: CSSStyleDeclaration;
	offsetLeft: number;
	offsetTop: number;
	scale: number;
}) => {
	let contextToDraw = context;

	const originalCompositeOperation = context.globalCompositeOperation;
	let offsetLeft = 0;
	let offsetTop = 0;

	using _ = {
		[Symbol.dispose]: () => {
			context.globalCompositeOperation = originalCompositeOperation;
			if (context !== contextToDraw) {
				context.drawImage(
					contextToDraw.canvas,
					offsetLeft,
					offsetTop,
					// The context currently has a transform of `scale(scale, scale)`, and we requested
					// a canvas with extra scale as well, dividing, since the context will multiply it again.
					contextToDraw.canvas.width / scale,
					contextToDraw.canvas.height / scale,
				);
			}
		},
	};

	const boundingRect = getBoxBasedOnBackgroundClip(
		rect,
		computedStyle,
		backgroundClip,
	);

	if (boundingRect.width <= 0 || boundingRect.height <= 0) {
		return;
	}

	if (backgroundClip.includes('text')) {
		offsetLeft = boundingRect.left;
		offsetTop = boundingRect.top;
		const originalBackgroundClip = element.style.backgroundClip;
		const originalWebkitBackgroundClip = element.style.webkitBackgroundClip;
		element.style.backgroundClip = 'initial';
		element.style.webkitBackgroundClip = 'initial';
		const textLayerCutout = new DOMRect(
			boundingRect.left + parentOffsetLeft,
			boundingRect.top + parentOffsetTop,
			boundingRect.width,
			boundingRect.height,
		);
		const onlyBackgroundClipText = await createLayer({
			transparent: true,
			element,
			cutout: textLayerCutout,
			logLevel,
			internalState,
			scale,
			onlyBackgroundClipText: true,
			waitForPageResponsiveness: null,
		});
		onlyBackgroundClipText.setTransform(new DOMMatrix().scale(scale, scale));
		element.style.backgroundClip = originalBackgroundClip;
		element.style.webkitBackgroundClip = originalWebkitBackgroundClip;
		contextToDraw = onlyBackgroundClipText;
		contextToDraw.globalCompositeOperation = 'source-in';
	}

	const positioningArea = getBoxBasedOnBackgroundClip(
		rect,
		computedStyle,
		computedStyle.backgroundOrigin,
	);
	const paintFill = (
		target: OffscreenCanvasRenderingContext2D,
		fill: Awaited<ReturnType<typeof getBackgroundFill>>,
		originX: number,
		originY: number,
	) => {
		if (!fill) return;
		const previousSmoothing = target.imageSmoothingEnabled;
		using _restoreImageSmoothing = {
			[Symbol.dispose]: () => {
				target.imageSmoothingEnabled = previousSmoothing;
			},
		};
		if (
			computedStyle.imageRendering === 'pixelated' &&
			parseUrlFunction(backgroundImage) !== null
		) {
			target.imageSmoothingEnabled = false;
		}

		if ('image' in fill) {
			target.save();
			target.beginPath();
			target.rect(
				boundingRect.left - originX,
				boundingRect.top - originY,
				boundingRect.width,
				boundingRect.height,
			);
			target.clip();
			const matrix = target.getTransform();
			// Transformed native backgrounds sample in local paint coordinates.
			// Localize integer translations without changing the tile geometry.
			const localizeTranslation =
				computedStyle.imageRendering === 'pixelated' &&
				hasCssTransform &&
				matrix.a === 1 &&
				matrix.b === 0 &&
				matrix.c === 0 &&
				matrix.d === 1 &&
				Number.isInteger(matrix.e) &&
				Number.isInteger(matrix.f);
			for (const tile of fill.rects) {
				const left = Math.round(tile.left - originX);
				const top = Math.round(tile.top - originY);
				const right = Math.round(tile.right - originX);
				const bottom = Math.round(tile.bottom - originY);
				if (localizeTranslation) {
					target.translate(left, top);
					target.drawImage(fill.image, 0, 0, right - left, bottom - top);
					target.translate(-left, -top);
				} else {
					target.drawImage(fill.image, left, top, right - left, bottom - top);
				}
			}

			target.restore();
			return;
		}

		target.save();
		using _restoreFill = {[Symbol.dispose]: () => target.restore()};
		target.fillStyle = fill;
		target.fillRect(
			boundingRect.left - originX,
			boundingRect.top - originY,
			boundingRect.width,
			boundingRect.height,
		);
	};

	const blendMode = getBlendMode(computedStyle.backgroundBlendMode);
	if (
		backgroundImage !== 'none' &&
		(blendMode ||
			contextToDraw !== context ||
			(!isColorTransparent(backgroundColor) &&
				(context.globalAlpha !== 1 ||
					(typeof context.filter === 'string' && context.filter !== 'none'))))
	) {
		// Blend inside the background group before applying element opacity, filters and text masks.
		const transform = contextToDraw.getTransform();
		const left = boundingRect.left - offsetLeft;
		const top = boundingRect.top - offsetTop;
		// Preserve authored transform offsets while aligning the layout origin
		// of the temporary group to the CSS pixel grid.
		const layoutLeft = rect.left + parentOffsetLeft;
		const layoutTop = rect.top + parentOffsetTop;
		const deviceLeft =
			transform.a * left +
			transform.e +
			(Math.round(layoutLeft) - layoutLeft) * scale;
		const deviceTop =
			transform.d * top +
			transform.f +
			(Math.round(layoutTop) - layoutTop) * scale;
		const rasterLeft = Math.floor(deviceLeft);
		const rasterTop = Math.floor(deviceTop);
		const rasterWidth =
			Math.ceil(deviceLeft + transform.a * boundingRect.width) - rasterLeft;
		const rasterHeight =
			Math.ceil(deviceTop + transform.d * boundingRect.height) - rasterTop;
		const paintAtDestinationResolution =
			blendMode === null &&
			contextToDraw === context &&
			backgroundImage.startsWith('linear-gradient(') &&
			transform.a > 0 &&
			transform.d > 0 &&
			transform.b === 0 &&
			transform.c === 0 &&
			(transform.a > scale || transform.d > scale) &&
			rasterWidth > 0 &&
			rasterHeight > 0 &&
			rasterWidth <= 16384 &&
			rasterHeight <= 16384 &&
			rasterWidth * rasterHeight <= 16777216;
		const backgroundCanvas = new OffscreenCanvas(
			paintAtDestinationResolution
				? rasterWidth
				: Math.ceil(boundingRect.width * scale),
			paintAtDestinationResolution
				? rasterHeight
				: Math.ceil(boundingRect.height * scale),
		);
		using _backgroundCanvas = {
			[Symbol.dispose]: () => {
				backgroundCanvas.width = 0;
				backgroundCanvas.height = 0;
			},
		};
		const backgroundContext = backgroundCanvas.getContext('2d');
		if (!backgroundContext)
			throw new Error('Could not create background compositing context');
		if (paintAtDestinationResolution) {
			backgroundContext.setTransform(
				transform.a,
				0,
				0,
				transform.d,
				deviceLeft - rasterLeft,
				deviceTop - rasterTop,
			);
		} else {
			backgroundContext.scale(scale, scale);
		}

		backgroundContext.fillStyle = backgroundColor;
		backgroundContext.fillRect(0, 0, boundingRect.width, boundingRect.height);
		const groupFill = await getBackgroundFill({
			backgroundImage,
			backgroundRepeat: computedStyle.backgroundRepeat,
			internalState,
			positioningArea,
			backgroundPosition: computedStyle.backgroundPosition,
			backgroundSize: computedStyle.backgroundSize,
			contextToDraw: backgroundContext,
			boundingRect,
			offsetLeft: boundingRect.left,
			offsetTop: boundingRect.top,
		});
		backgroundContext.globalCompositeOperation = blendMode ?? 'source-over';
		paintFill(
			backgroundContext,
			groupFill,
			boundingRect.left,
			boundingRect.top,
		);
		if (paintAtDestinationResolution) {
			contextToDraw.save();
			try {
				contextToDraw.resetTransform();
				contextToDraw.drawImage(backgroundCanvas, rasterLeft, rasterTop);
			} finally {
				contextToDraw.restore();
			}

			return;
		}

		if (blendMode) {
			contextToDraw.drawImage(
				backgroundCanvas,
				boundingRect.left - offsetLeft,
				boundingRect.top - offsetTop,
				backgroundCanvas.width / scale,
				backgroundCanvas.height / scale,
			);
			return;
		}

		const pattern = contextToDraw.createPattern(backgroundCanvas, 'no-repeat');
		if (!pattern)
			throw new Error('Could not create background compositing pattern');
		pattern.setTransform(
			new DOMMatrix()
				.translate(boundingRect.left - offsetLeft, boundingRect.top - offsetTop)
				.scale(1 / scale),
		);
		const previousFill = contextToDraw.fillStyle;
		try {
			contextToDraw.fillStyle = pattern;
			contextToDraw.fillRect(
				boundingRect.left - offsetLeft,
				boundingRect.top - offsetTop,
				backgroundCanvas.width / scale,
				backgroundCanvas.height / scale,
			);
		} finally {
			contextToDraw.fillStyle = previousFill;
		}

		return;
	}

	if (backgroundColor && !isColorTransparent(backgroundColor)) {
		const previous = contextToDraw.fillStyle;
		contextToDraw.fillStyle = backgroundColor;
		contextToDraw.fillRect(
			boundingRect.left - offsetLeft,
			boundingRect.top - offsetTop,
			boundingRect.width,
			boundingRect.height,
		);
		contextToDraw.fillStyle = previous;
	}

	const backgroundFill = await getBackgroundFill({
		backgroundImage,
		backgroundRepeat: computedStyle.backgroundRepeat,
		internalState,
		positioningArea,
		backgroundPosition: computedStyle.backgroundPosition,
		backgroundSize: computedStyle.backgroundSize,
		contextToDraw,
		boundingRect,
		offsetLeft,
		offsetTop,
	});
	paintFill(contextToDraw, backgroundFill, offsetLeft, offsetTop);
};
