import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	sharpShadowSampling,
	sharpShadowScales,
} from './fixtures/sharp-shadow-sampling';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(sharpShadowScales)(
	'preserves native sampling for sharp shadows at scale %s',
	async (scale) => {
		const filter = sharpShadowSampling({scale, mode: 'filter'});
		const translated = sharpShadowSampling({scale, mode: 'translated'});
		const device = sharpShadowSampling({scale, mode: 'device'});
		const capture = (composition: typeof filter) =>
			captureNativeReference(composition, 0, {omitBackground: false});
		const images = {
			filter: await capture(filter),
			translated: await capture(translated),
			device: await capture(device),
			exported: await (
				await renderStillOnWeb({
					composition: filter,
					frame: 0,
					licenseKey: 'free-license',
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering: true,
				})
			).blob({format: 'png'}),
		};
		const output = `test/__results__/sharp-shadow-sampling/${server.browser}/${scale}`;
		for (const [name, blob] of Object.entries(images)) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer())) {
				binary += String.fromCharCode(byte);
			}

			await server.commands.writeFile(
				`${output}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		const counts = {
			filterToTranslated: await countNativePixels(
				images.filter,
				images.translated,
			),
			translatedToDevice: await countNativePixels(
				images.translated,
				images.device,
			),
			exportToFilter: await countNativePixels(images.filter, images.exported),
		};
		await server.commands.writeFile(
			`${output}/comparison.json`,
			JSON.stringify({
				scale,
				userAgent: navigator.userAgent,
				devicePixelRatio,
				counts,
			}),
		);
		for (const result of Object.values(counts)) {
			expect.soft(result.mismatchedPixels).toBe(0);
		}
	},
);
