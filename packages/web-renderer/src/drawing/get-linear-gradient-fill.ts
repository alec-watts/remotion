import type {InternalState} from '../internal-state';
import {getCanvasContextOptions} from './canvas-context-options';
import type {LinearGradientInfo} from './parse-linear-gradient';
import {createCanvasGradient} from './parse-linear-gradient';

export const getLinearGradientFill = ({
	contextToDraw,
	rect,
	paintRect,
	gradientInfo,
	offsetLeft,
	offsetTop,
	internalState,
}: {
	contextToDraw: OffscreenCanvasRenderingContext2D;
	rect: DOMRect;
	paintRect: DOMRect;
	gradientInfo: LinearGradientInfo;
	offsetLeft: number;
	offsetTop: number;
	internalState: InternalState;
}): CanvasGradient | CanvasPattern | null => {
	const {gradient, hasInterpolation} = createCanvasGradient({
		ctx: contextToDraw,
		rect,
		gradientInfo,
		offsetLeft,
		offsetTop,
	});
	if (hasInterpolation) return gradient;
	const options = getCanvasContextOptions(internalState, true);
	if (options.willReadFrequently) {
		const transform = contextToDraw.getTransform();
		let left = 0;
		let top = 0;
		let right = contextToDraw.canvas.width;
		let bottom = contextToDraw.canvas.height;
		if (
			typeof contextToDraw.filter === 'string' &&
			contextToDraw.filter !== 'none'
		) {
			// Filters can read painted input outside the output viewport. Extend
			// the bitmap on integer device coordinates to preserve its sample phase.
			for (const [x, y] of [
				[paintRect.left, paintRect.top],
				[paintRect.right, paintRect.top],
				[paintRect.right, paintRect.bottom],
				[paintRect.left, paintRect.bottom],
			]) {
				const point = new DOMPoint(
					x - offsetLeft,
					y - offsetTop,
				).matrixTransform(transform);
				left = Math.min(left, Math.floor(point.x));
				top = Math.min(top, Math.floor(point.y));
				right = Math.max(right, Math.ceil(point.x));
				bottom = Math.max(bottom, Math.ceil(point.y));
			}
		}

		const canvas = new OffscreenCanvas(right - left, bottom - top);
		try {
			const context = canvas.getContext('2d', options);
			if (!context) throw new Error('Could not get linear gradient context');
			const rasterTransform = new DOMMatrix()
				.translate(-left, -top)
				.multiply(transform);
			context.setTransform(rasterTransform);
			context.fillStyle = createCanvasGradient({
				ctx: context,
				rect,
				gradientInfo,
				offsetLeft,
				offsetTop,
			}).gradient;
			const inverse = rasterTransform.inverse();
			context.beginPath();
			for (const [index, [x, y]] of [
				[0, 0],
				[canvas.width, 0],
				[canvas.width, canvas.height],
				[0, canvas.height],
			].entries()) {
				const point = new DOMPoint(x, y).matrixTransform(inverse);
				if (index === 0) context.moveTo(point.x, point.y);
				else context.lineTo(point.x, point.y);
			}

			context.closePath();
			context.fill();
			const pattern = contextToDraw.createPattern(canvas, 'no-repeat');
			pattern?.setTransform(transform.inverse().translate(left, top));
			return pattern;
		} finally {
			canvas.width = 0;
			canvas.height = 0;
		}
	}

	return gradient;
};
