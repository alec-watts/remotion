import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {
	svgExternalCarrierModes,
	svgExternalEmptyCarrier,
	svgExternalFontReady,
	svgExternalFontSelection,
	svgExternalStyleSelectors,
} from './fixtures/svg-external-font-selection';
import {
	svgFontFamilyLifetime,
	svgFontFamilyLifetimeReady,
} from './fixtures/svg-font-family-lifetime';
import {captureNativeReference, countNativePixels} from './native-reference';

const cases = [
	...[0, 1, 2].map((frame) => ({composition: svgFontFamilyLifetime, frame})),
	...[
		svgExternalFontSelection,
		svgExternalStyleSelectors({literal: false}),
		...svgExternalCarrierModes
			.filter((mode) => mode !== 'cache')
			.map((mode) => svgExternalEmptyCarrier({mode, literal: false})),
	].map((composition) => ({composition, frame: 1})),
].map((entry) => ({...entry, id: `${entry.composition.id}-${entry.frame}`}));

test.for(cases)(
	'compares registered SVG native pixels in $id',
	async ({composition, frame, id}) => {
		await Promise.all([svgFontFamilyLifetimeReady, svgExternalFontReady]);
		const folder = `test/__results__/svg-readback-font-native-controls/${server.browser}/${id}`;
		const archive = async (label: string, blob: Blob) => {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);

			await server.commands.writeFile(
				`${folder}/${label}.png`,
				btoa(binary),
				'base64',
			);
			return blob;
		};

		const still = await renderStillOnWeb({
			composition,
			frame,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		});
		const actual = await archive('export', await still.blob({format: 'png'}));
		const reference = await archive(
			'native',
			await captureNativeReference(composition, frame, {omitBackground: false}),
		);
		const comparison = await countNativePixels(reference, actual);
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify(comparison),
		);
		expect(comparison.mismatchedPixels).toBe(0);
	},
);
