import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgCornerDeclarations} from './fixtures/svg-corner-styles';
import {captureNativeReference, compareNativePixels} from './native-reference';

test('preserves every native SVG pixel for variable and stylesheet corner declarations', async () => {
	const reference = await captureNativeReference(svgCornerDeclarations, 0, {
		omitBackground: false,
	});
	const result = await renderStillOnWeb({
		licenseKey: 'free-license',
		composition: {...svgCornerDeclarations, calculateMetadata: null},
		frame: 0,
		inputProps: {},
		allowHtmlInCanvas: false,
		transparent: false,
	});
	const actual = await result.blob({format: 'png'});
	const comparison = await compareNativePixels(reference, actual);
	const directory = `test/__results__/corner-review/${server.browser}`;
	for (const [name, blob] of [
		['reference', reference],
		['actual', actual],
	] as const) {
		let binary = '';
		for (const byte of new Uint8Array(await blob.arrayBuffer()))
			binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`${directory}/${name}.png`,
			btoa(binary),
			'base64',
		);
	}

	await server.commands.writeFile(
		`${directory}/comparison.json`,
		JSON.stringify(comparison),
	);
	expect(comparison.mismatchedPixels).toBe(0);
});
