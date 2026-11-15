import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgTitledPersistentOrder} from './fixtures/svg-persistent-font-order';
import {captureNativeReference, compareNativePixels} from './native-reference';

for (const firstRoboto of [false, true]) {
	test(`CSSOM font replay matches native ${firstRoboto ? 'Roboto' : 'Bangers'}`, async () => {
		const composition = svgTitledPersistentOrder(
			'cssom-last',
			firstRoboto,
			false,
		);
		const literalComposition = svgTitledPersistentOrder(
			'cssom-last',
			firstRoboto,
			true,
		);
		const reference = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const literal = await captureNativeReference(literalComposition, 0, {
			omitBackground: false,
		});
		const actual = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition,
				frame: 0,
				inputProps: {},
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		const control = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition: literalComposition,
				frame: 0,
				inputProps: {},
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		const oracle = await compareNativePixels(reference, literal);
		const result = await compareNativePixels(reference, actual);
		const exportedControl = await compareNativePixels(control, actual);
		const directory =
			'test/__results__/cssom-font-order/' +
			server.browser +
			'/' +
			(firstRoboto ? 'roboto' : 'bangers');
		for (const [name, blob] of [
			['reference', reference],
			['literal', literal],
			['actual', actual],
			['control', control],
			['diff', result.diff],
		] as const) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				directory + '/' + name + '.png',
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			directory + '/comparison.json',
			JSON.stringify(
				{
					browser: server.browser,
					platform: server.platform,
					devicePixelRatio,
					width: composition.width,
					height: composition.height,
					oracleMismatchedPixels: oracle.mismatchedPixels,
					mismatchedPixels: result.mismatchedPixels,
					maxChannelDelta: result.maxChannelDelta,
					exportedControlMismatchedPixels: exportedControl.mismatchedPixels,
				},
				null,
				2,
			),
		);
		expect(oracle.mismatchedPixels).toBe(0);
		expect(exportedControl.mismatchedPixels).toBe(0);
		expect(result.mismatchedPixels).toBe(0);
	});
}
