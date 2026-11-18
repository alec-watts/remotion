import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgFontFamilyLifetimeReady} from './fixtures/svg-font-family-lifetime';
import {
	svgReadbackBounds,
	svgReadbackBoundsModes,
} from './fixtures/svg-readback-bounds';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(svgReadbackBoundsModes)(
	'keeps bounded SVG readback native-exact for %s',
	{timeout: 60000},
	async (mode) => {
		await svgFontFamilyLifetimeReady;
		const composition = svgReadbackBounds(mode);
		const allocations: {width: number; height: number}[] = [];
		const {getContext} = OffscreenCanvas.prototype;
		const observer = vi
			.spyOn(OffscreenCanvas.prototype, 'getContext')
			.mockImplementation(function (
				this: OffscreenCanvas,
				...args: Parameters<typeof getContext>
			) {
				if (args[1]?.willReadFrequently)
					allocations.push({width: this.width, height: this.height});
				return getContext.apply(this, args);
			});
		let actual: Blob;
		try {
			actual = await (
				await renderStillOnWeb({
					composition,
					frame: 0,
					inputProps: {},
					licenseKey: 'free-license',
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
		} finally {
			observer.mockRestore();
		}

		const folder = `test/__results__/svg-readback-bounds/${server.browser}/${mode}`;
		const savePng = async (name: string, blob: Blob) => {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		};

		await savePng('export', actual);
		await server.commands.writeFile(
			`${folder}/allocations.json`,
			JSON.stringify({
				mode,
				width: composition.width,
				height: composition.height,
				allocations,
			}),
		);
		const reference = await captureNativeReference(composition, 0, {
			omitBackground: mode === 'translucent',
		});
		await savePng('native', reference);
		const comparison = await countNativePixels(reference, actual);
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify(comparison),
		);
		expect.soft(comparison.mismatchedPixels).toBe(0);
		if (server.browser === 'webkit' && mode === 'large') {
			expect(allocations).toContainEqual({width: 680, height: 100});
			expect(
				allocations.every(
					({width, height}) => width * height <= 16 * 1024 ** 2,
				),
			).toBe(true);
		}
	},
);
