import {expect, test} from 'vitest';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgRootMaskGeometry,
	svgRootMaskModes,
} from './fixtures/svg-root-mask-geometry';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for(
	svgRootMaskModes.flatMap((mode) => [1, 1.5].map((scale) => ({mode, scale}))),
)('matches native root SVG mask $mode scale $scale', async ({mode, scale}) => {
	const composition = svgRootMaskGeometry(mode, scale);
	const native = await captureNativeReference(composition, 0, {
		omitBackground: false,
	});
	const actual = await (
		await renderStillOnWeb({
			composition,
			frame: 0,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		})
	).blob({format: 'png'});
	expect((await compareNativePixels(native, actual)).mismatchedPixels).toBe(0);
});
