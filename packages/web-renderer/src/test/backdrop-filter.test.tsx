import '../symbol-dispose';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {backdropFilter, backdropFilterCases} from './fixtures/backdrop-filter';
import {
	captureNativeReference,
	compareNativePixels,
	countNativePixels,
} from './native-reference';

for (const scene of backdropFilterCases) {
	for (const frame of [0, 1]) {
		test(`matches native ${scene.mode} backdrop filtering at frame ${frame}`, async () => {
			expect(
				CSS.supports('backdrop-filter', scene.filter) ||
					CSS.supports('-webkit-backdrop-filter', scene.filter),
			).toBe(true);
			const composition = backdropFilter({scene, enabled: true});
			const reference = await captureNativeReference(composition, frame, {
				omitBackground: false,
			});
			const control = await captureNativeReference(
				backdropFilter({scene, enabled: false}),
				frame,
				{omitBackground: false},
			);
			const actual = await (
				await renderStillOnWeb({
					composition,
					frame,
					inputProps: {},
					licenseKey: 'free-license',
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
			const differentFromControl = await countNativePixels(control, reference);
			const comparison = await compareNativePixels(reference, actual);
			await server.commands.writeFile(
				`test/__results__/backdrop-filter/${server.browser}/${scene.mode}-${frame}.json`,
				JSON.stringify({
					nativeEffectPixels: differentFromControl.mismatchedPixels,
					rendererMismatchedPixels: comparison.mismatchedPixels,
					rendererMaxChannelDelta: comparison.maxChannelDelta,
					userAgent: navigator.userAgent,
				}),
			);
			expect(differentFromControl.mismatchedPixels).toBeGreaterThan(0);
			expect(comparison.mismatchedPixels).toBe(0);
		});
	}
}
