import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {makeScaledShadowFixture} from './fixtures/affine-filter-stress';
import {captureNativeReference, countNativePixels} from './native-reference';
import {traceAffineFilter} from './trace-affine-filter';

test.for(['fractional', 'rounded', 'blurred'] as const)(
	'preserves raw output while probing %s filter stages',
	async (variant) => {
		const composition = makeScaledShadowFixture(variant, false);
		const native = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const render = async () =>
			(
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition,
					frame: 0,
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering: true,
				})
			).blob({format: 'png'});
		const plain = await render();
		const path = `test/__results__/filter-stage-probe/${server.browser}/${variant}`;
		const traced = await traceAffineFilter(path, render);
		const instrumentation = await countNativePixels(plain, traced);
		const nativeDifference = await countNativePixels(native, plain);
		for (const [name, blob] of [
			['native', native],
			['plain', plain],
			['traced', traced],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${path}/probe.json`,
			JSON.stringify({
				variant,
				browser: server.browser,
				userAgent: navigator.userAgent,
				instrumentationMismatchedPixels: instrumentation.mismatchedPixels,
				nativeMismatchedPixels: nativeDifference.mismatchedPixels,
			}),
		);
		expect(instrumentation.mismatchedPixels).toBe(0);
		expect(nativeDifference.mismatchedPixels).toBe(0);
	},
);
