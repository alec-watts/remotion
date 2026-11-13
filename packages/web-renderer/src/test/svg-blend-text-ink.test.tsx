import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgPrecomposeFont,
	svgPrecomposeFontSources,
} from './fixtures/svg-precompose-font';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	svgPrecomposeFontSources.flatMap((source) =>
		[3, 4].map((fontStep) => ({source, fontStep})),
	),
)(
	'preserves blended glyph ink for $source at font step $fontStep',
	async ({source, fontStep}) => {
		const composition = svgPrecomposeFont({
			source,
			effect: 'blend',
			literal: false,
			fontStep,
			paint: null,
		});
		const plain = svgPrecomposeFont({
			source,
			effect: 'none',
			literal: false,
			fontStep,
			paint: null,
		});
		const native = await captureNativeReference(composition, 1, {
			omitBackground: false,
		});
		const nativePlain = await captureNativeReference(plain, 1, {
			omitBackground: false,
		});
		const options = {
			frame: 1,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		} as const;
		const actual = await (
			await renderStillOnWeb({...options, composition})
		).blob({format: 'png'});
		const control = await (
			await renderStillOnWeb({...options, composition: plain})
		).blob({format: 'png'});
		const counts = {
			nativeControl: await countNativePixels(native, nativePlain),
			control: await countNativePixels(control, actual),
			native: await countNativePixels(native, actual),
		};
		const path = `test/__results__/svg-text-ink/${server.browser}/${source}-${fontStep}`;
		for (const [role, blob] of [
			['native', native],
			['native-control', nativePlain],
			['actual', actual],
			['control', control],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${role}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${path}/comparison.json`,
			JSON.stringify(counts),
		);
		expect.soft(counts.nativeControl.mismatchedPixels).toBe(0);
		expect.soft(counts.control.mismatchedPixels).toBe(0);
		expect(counts.native.mismatchedPixels).toBe(0);
	},
);
