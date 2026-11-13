import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	persistentOrderModes,
	svgTitledPersistentOrder,
} from './fixtures/svg-titled-data-font';
import {
	captureNativeReference,
	compareNativePixels,
	countNativePixels,
} from './native-reference';

test.for(
	[false, true].flatMap((firstRoboto) =>
		persistentOrderModes.map((mode) => ({firstRoboto, mode})),
	),
)(
	'preserves persistent face order, Roboto=$firstRoboto mode=$mode',
	async ({firstRoboto, mode}) => {
		const composition = svgTitledPersistentOrder(mode, firstRoboto, false);
		const literal = svgTitledPersistentOrder(mode, firstRoboto, true);
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
		const path = `test/__results__/persistent-font-order/${server.browser}/${firstRoboto}-${mode}`;
		for (const [role, blob] of [
			['native', native],
			['native-control', nativeControl],
			['actual', actual],
			['control', control],
		] as const) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
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
