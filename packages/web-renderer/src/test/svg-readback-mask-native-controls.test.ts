import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {svgFontFamilyLifetimeReady} from './fixtures/svg-font-family-lifetime';
import {
	svgReadbackMask,
	svgReadbackMaskModes,
} from './fixtures/svg-readback-mask';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	svgReadbackMaskModes.flatMap((mode) =>
		[0, 1, 2].map((frame) => ({mode, frame})),
	),
)('compares native SVG mask $mode at frame $frame', async ({mode, frame}) => {
	await svgFontFamilyLifetimeReady;
	const composition = svgReadbackMask(mode);
	const actual = await (
		await renderStillOnWeb({
			composition,
			frame,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		})
	).blob({format: 'png'});
	const native = await captureNativeReference(composition, frame, {
		omitBackground: false,
	});
	const folder = `test/__results__/svg-readback-mask-native-controls/${server.browser}/${mode}-${frame}`;
	for (const [label, blob] of [
		['native', native],
		['export', actual],
	] as const) {
		let binary = '';
		for (const byte of new Uint8Array(await blob.arrayBuffer()))
			binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`${folder}/${label}.png`,
			btoa(binary),
			'base64',
		);
	}
	const comparison = await countNativePixels(native, actual);
	await server.commands.writeFile(
		`${folder}/comparison.json`,
		JSON.stringify(comparison),
	);
	expect(comparison.mismatchedPixels).toBe(0);
});
