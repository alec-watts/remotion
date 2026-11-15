import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgPrecomposeFont,
	svgPrecomposeFontSources,
	svgPrecomposeFontEffects,
	svgPrecomposePaintKinds,
} from './fixtures/svg-precompose-font';
import {captureNativeReference, compareNativePixels} from './native-reference';
import {testCompositions} from './utils';

const cases = svgPrecomposeFontSources.flatMap((source) => [
	...svgPrecomposeFontEffects.map((effect) => ({
		source,
		effect,
		fontStep: null,
		paint: null,
	})),
	...svgPrecomposePaintKinds.map((paint) => ({
		source,
		effect: 'blend' as const,
		fontStep: null,
		paint,
	})),
	{source, effect: 'blend' as const, fontStep: 4, paint: null},
]);
test('records the unchanged original precompose grid before native diagnostics', async () => {
	const blobs: Blob[] = [];
	const createObjectURL = URL.createObjectURL.bind(URL);
	const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
		if (value instanceof Blob && value.type === 'image/png') blobs.push(value);
		return createObjectURL(value);
	});
	try {
		await testCompositions({
			cases: cases.map((input) => ({
				composition: svgPrecomposeFont({...input, literal: false}),
				frame: 1,
			})),
			columns: 4,
			testId: 'svg-precompose-fonts-and-paint-bounds',
			scale: null,
		});
	} finally {
		spy.mockRestore();
		for (const [index, blob] of blobs.entries()) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				'test/__results__/precompose-native/' +
					server.browser +
					'/original-grid-' +
					index +
					'.png',
				btoa(binary),
				'base64',
			);
		}
	}
});

for (const [index, input] of cases.entries()) {
	const composition = svgPrecomposeFont({...input, literal: false});
	test(`native precompose ${index} ${composition.id}`, async () => {
		const literalComposition = svgPrecomposeFont({...input, literal: true});
		const reference = await captureNativeReference(composition, 1, {
			omitBackground: false,
		});
		const literal = await captureNativeReference(literalComposition, 1, {
			omitBackground: false,
		});
		const svgBlobs: Blob[] = [];
		const createObjectURL = URL.createObjectURL.bind(URL);
		const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
			if (value instanceof Blob && value.type.startsWith('image/svg+xml'))
				svgBlobs.push(value);
			return createObjectURL(value);
		});
		let actual: Blob;
		let control: Blob;
		try {
			actual = await (
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition,
					frame: 1,
					inputProps: {},
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
			control = await (
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition: literalComposition,
					frame: 1,
					inputProps: {},
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
		} finally {
			spy.mockRestore();
		}

		const oracle = await compareNativePixels(reference, literal);
		const result = await compareNativePixels(reference, actual);
		const exported = await compareNativePixels(control, actual);
		const literalNative = await compareNativePixels(literal, control);
		const directory =
			'test/__results__/precompose-native/' +
			server.browser +
			'/' +
			String(index).padStart(2, '0');
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

		for (const [svgIndex, blob] of svgBlobs.entries())
			await server.commands.writeFile(
				directory + '/drawable-' + svgIndex + '.svg',
				await blob.text(),
			);
		await server.commands.writeFile(
			directory + '/comparison.json',
			JSON.stringify(
				{
					index,
					input,
					id: composition.id,
					browser: server.browser,
					platform: server.platform,
					userAgent: navigator.userAgent,
					devicePixelRatio,
					width: composition.width,
					height: composition.height,
					frame: 1,
					oracleMismatchedPixels: oracle.mismatchedPixels,
					mismatchedPixels: result.mismatchedPixels,
					maxChannelDelta: result.maxChannelDelta,
					exportedControlMismatchedPixels: exported.mismatchedPixels,
					literalNativeMismatchedPixels: literalNative.mismatchedPixels,
					svgCount: svgBlobs.length,
				},
				null,
				2,
			),
		);
		expect(oracle.mismatchedPixels).toBe(0);
		expect(exported.mismatchedPixels).toBe(0);
		expect(result.mismatchedPixels).toBe(0);
	});
}
