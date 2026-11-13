import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	filterColorSpaceModes,
	filterColorSpaceShadow,
} from './fixtures/filter-color-space-shadow';
import {
	captureNativeReference,
	compareNativePixels,
	countNativePixels,
} from './native-reference';

test.for(filterColorSpaceModes.map((mode) => ({mode})))(
	'retains offscreen input for a $mode shadow color',
	async ({mode}) => {
		const composition = filterColorSpaceShadow(mode, false);
		const literal = filterColorSpaceShadow(mode, true);
		const native = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const nativeControl = await captureNativeReference(literal, 0, {
			omitBackground: false,
		});
		const options = {
			frame: 0,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		} as const;
		const actual = await (
			await renderStillOnWeb({...options, composition})
		).blob({format: 'png'});
		const control = await (
			await renderStillOnWeb({...options, composition: literal})
		).blob({format: 'png'});
		const nativeControlPixels = await countNativePixels(nativeControl, native);
		const nativePixels = await compareNativePixels(native, actual);
		const controlPixels = await countNativePixels(control, actual);
		const path = `test/__results__/filter-color-space/${server.browser}/${mode}`;
		for (const [role, blob] of [
			['native', native],
			['native-control', nativeControl],
			['actual', actual],
			['control', control],
		] as const) {
			const data = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of data) binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${role}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${path}/comparison.json`,
			JSON.stringify({nativeControlPixels, nativePixels, controlPixels}),
		);
		expect.soft(nativeControlPixels.mismatchedPixels).toBe(0);
		expect.soft(controlPixels.mismatchedPixels).toBe(0);
		expect(nativePixels.mismatchedPixels).toBe(0);
	},
);
