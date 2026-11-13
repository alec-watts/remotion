import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgPrecomposeFont} from './fixtures/svg-precompose-font';
import {captureNativeReference, countNativePixels} from './native-reference';

const cases = (['registered', 'import'] as const).flatMap((source) =>
	(['stroke', null] as const).flatMap((paint) =>
		[false, true].flatMap((literal) =>
			[0, 1].map((frame) => ({source, paint, literal, frame})),
		),
	),
);

test.for(cases)(
	'compares native SVG source=$source paint=$paint literal=$literal frame=$frame',
	async ({source, paint, literal, frame}) => {
		const composition = svgPrecomposeFont({
			source,
			effect: 'blend',
			literal,
			fontStep: null,
			paint,
		});
		const native = await captureNativeReference(composition, frame, {
			omitBackground: false,
		});
		const actual = await (
			await renderStillOnWeb({
				composition,
				frame,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		const difference = await countNativePixels(native, actual);
		const path = `test/__results__/svg-stroke-native/${server.browser}/${source}-${paint ?? 'none'}-${literal}-${frame}`;
		for (const [name, blob] of [
			['native', native],
			['actual', actual],
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
			`${path}/comparison.json`,
			JSON.stringify({
				source,
				paint,
				literal,
				frame,
				browser: server.browser,
				userAgent: navigator.userAgent,
				...difference,
			}),
		);
		expect(difference.mismatchedPixels).toBe(0);
	},
);
