import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	verticalTextCases,
	verticalTextFontReady,
	verticalTextNative,
} from './fixtures/vertical-text-native';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	verticalTextCases.flatMap((entry) =>
		[1, 1.5].flatMap((scale) =>
			(['original', 'inset'] as const).map((placement) => ({
				entry,
				scale,
				placement,
			})),
		),
	),
)(
	'matches browser writing mode $entry.id at scale $scale with $placement positioning',
	async ({entry, scale, placement}) => {
		await verticalTextFontReady;
		const html = verticalTextNative({entry, carrier: 'html', placement});
		const svg = verticalTextNative({entry, carrier: 'svg', placement});
		const Scene = html.component;
		const reference = await captureNativeReference(
			{
				...html,
				width: html.width * scale,
				height: html.height * scale,
				component: () => (
					<div
						style={{
							position: 'absolute',
							width: html.width,
							height: html.height,
							transform: `scale(${scale})`,
							transformOrigin: '0 0',
						}}
					>
						<Scene />
					</div>
				),
			},
			0,
			{omitBackground: false},
		);
		const render = async (composition: typeof html) =>
			(
				await renderStillOnWeb({
					composition,
					licenseKey: 'free-license',
					frame: 0,
					inputProps: {},
					scale,
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
		const draws = vi.spyOn(
			OffscreenCanvasRenderingContext2D.prototype,
			'drawImage',
		);
		let actual: Blob;
		const textRasters: number[][] = [];
		try {
			actual = await render(html);
			for (const [drawable, ...destination] of draws.mock.calls) {
				if (
					drawable instanceof HTMLImageElement &&
					drawable.src.startsWith('data:image/svg+xml') &&
					drawable.src.includes('foreignObject')
				) {
					textRasters.push([drawable.width, drawable.height, ...destination]);
				}
			}
		} finally {
			draws.mockRestore();
		}

		const svgExport = await render(svg);
		const output = `test/__results__/vertical-text/${server.browser}/${entry.id}/${scale}${placement === 'inset' ? '/inset' : ''}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
			['svg', svgExport],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${output}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		const counts = {
			dom: await countNativePixels(reference, actual),
			svg: await countNativePixels(reference, svgExport),
		};
		await server.commands.writeFile(
			`${output}/comparison.json`,
			JSON.stringify({
				entry,
				scale,
				placement,
				textRasters,
				counts,
				writingModeSupported: CSS.supports('writing-mode', entry.writingMode),
				orientationSupported: CSS.supports(
					'text-orientation',
					entry.textOrientation,
				),
			}),
		);
		expect.soft(counts.dom.mismatchedPixels).toBe(0);
		expect.soft(counts.svg.mismatchedPixels).toBe(0);
	},
);
