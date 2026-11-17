import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {
	svgDefinitionFont,
	svgDefinitionFontUrl,
} from './fixtures/svg-font-definition-review';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for(
	(['url', 'data'] as const).flatMap((first) =>
		[0, 1].map((frame) => ({first, frame})),
	),
)(
	'paints native feImage with $first first at frame $frame',
	async (options) => {
		const {first, frame} = options;
		const url = new URL(svgDefinitionFontUrl);
		url.searchParams.set('remotionNativeFontTrial', `${first}-${frame}`);
		const response = await fetch(svgDefinitionFontUrl);
		expect(response.ok).toBe(true);
		const bytes = await response.arrayBuffer();
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(new Blob([bytes], {type: 'font/woff2'}));
		});
		const capture = (source: 'url' | 'data') =>
			captureNativeReference(
				svgDefinitionFont({
					mode: 'filter-image',
					fontUrl: source === 'url' ? url.href : dataUrl,
				}),
				frame,
				{omitBackground: false},
			);
		const second = first === 'url' ? 'data' : 'url';
		const images = {
			[`${first}-first`]: await capture(first),
			[`${second}-first`]: await capture(second),
			[`${first}-repeat`]: await capture(first),
			[`${second}-repeat`]: await capture(second),
		};
		const output = `test/__results__/svg-fe-image-order/${server.browser}/${first}-first-frame-${frame}`;
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
			firstSources: await compareNativePixels(
				images['url-first'],
				images['data-first'],
			),
			repeatedSources: await compareNativePixels(
				images['url-repeat'],
				images['data-repeat'],
			),
			urlRepeat: await compareNativePixels(
				images['url-first'],
				images['url-repeat'],
			),
			dataRepeat: await compareNativePixels(
				images['data-first'],
				images['data-repeat'],
			),
		};
		await server.commands.writeFile(
			`${output}/comparison.json`,
			JSON.stringify({first, frame, userAgent: navigator.userAgent, counts}),
		);
		for (const comparison of Object.values(counts)) {
			expect.soft(comparison.mismatchedPixels).toBe(0);
		}
	},
);
