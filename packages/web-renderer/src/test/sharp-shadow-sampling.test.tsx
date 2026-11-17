import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	sharpShadowPlacements,
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

test.for(
	sharpShadowScales
		.slice(1)
		.flatMap((scale) =>
			sharpShadowPlacements.map((placement) => ({scale, placement})),
		),
)(
	'preserves a fixed sharp shadow at scale $scale with caster $placement.kind',
	async ({scale, placement}) => {
		const original = sharpShadowSampling({scale, mode: 'filter'});
		const moved = sharpShadowSampling({scale, mode: 'filter'}, placement);
		const images = {
			original: await captureNativeReference(original, 0, {
				omitBackground: false,
			}),
			moved: await captureNativeReference(moved, 0, {omitBackground: false}),
			exported: await (
				await renderStillOnWeb({
					composition: moved,
					frame: 0,
					licenseKey: 'free-license',
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering: true,
				})
			).blob({format: 'png'}),
		};
		const output = `test/__results__/sharp-shadow-caster/${server.browser}/${scale}/${placement.kind}`;
		for (const [role, blob] of Object.entries(images)) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer())) {
				binary += String.fromCharCode(byte);
			}

			await server.commands.writeFile(
				`${output}/${role}.png`,
				btoa(binary),
				'base64',
			);
		}

		const counts = {
			nativeToMoved: await countNativePixels(images.original, images.moved),
			exportToMoved: await countNativePixels(images.moved, images.exported),
		};
		await server.commands.writeFile(
			`${output}/comparison.json`,
			JSON.stringify({scale, placement, counts}),
		);
		expect.soft(counts.nativeToMoved.mismatchedPixels).toBe(0);
		expect.soft(counts.exportToMoved.mismatchedPixels).toBe(0);
	},
);
