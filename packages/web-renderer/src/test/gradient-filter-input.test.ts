import {expect, test} from 'vitest';
import {getLinearGradientFill} from '../drawing/get-linear-gradient-fill';
import {
	createCanvasGradient,
	parseLinearGradient,
} from '../drawing/parse-linear-gradient';
import {makeInternalState} from '../internal-state';
import '../symbol-dispose';
import {
	filteredGradientCases,
	filteredGradientModes,
} from './fixtures/gradient-filter-input';

test.for(
	filteredGradientCases.flatMap((scene) =>
		filteredGradientModes.map((mode) => ({...scene, mode})),
	),
)(
	'preserves filtered $mode gradient input across the $side boundary',
	({rect, matrix, mode}) => {
		using state = makeInternalState();
		state.canvasContextState.willReadFrequently = true;
		const bounds = new DOMRect(...rect);
		const gradientInfo = parseLinearGradient(
			mode === 'solid'
				? 'linear-gradient(90deg, red, red)'
				: 'linear-gradient(90deg, red 0%, red 50%, blue 50%, blue 100%)',
		)!;
		const canvases = [new OffscreenCanvas(60, 40), new OffscreenCanvas(60, 40)];
		try {
			for (const [index, canvas] of canvases.entries()) {
				const context = canvas.getContext('2d', {willReadFrequently: true})!;
				context.setTransform(new DOMMatrix([...matrix]));
				context.filter = 'blur(6px)';
				const fillOptions = {
					contextToDraw: context,
					rect: bounds,
					paintRect: bounds,
					gradientInfo,
					offsetLeft: 0,
					offsetTop: 0,
					internalState: state,
				};
				const fill =
					index === 0
						? createCanvasGradient({
								ctx: context,
								rect: bounds,
								gradientInfo,
								offsetLeft: 0,
								offsetTop: 0,
							}).gradient
						: getLinearGradientFill(fillOptions);
				expect(fill).not.toBeNull();
				context.fillStyle = fill!;
				context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
			}

			const pixels = canvases.map(
				(c) => c.getContext('2d')!.getImageData(0, 0, 60, 40).data,
			);
			expect(pixels[0].some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
			let mismatchedPixels = 0;
			for (let i = 0; i < pixels[0].length; i += 4) {
				if ([0, 1, 2, 3].some((c) => pixels[0][i + c] !== pixels[1][i + c]))
					mismatchedPixels++;
			}

			expect(mismatchedPixels).toBe(0);
		} finally {
			for (const canvas of canvases) {
				canvas.width = 0;
				canvas.height = 0;
			}
		}
	},
);
