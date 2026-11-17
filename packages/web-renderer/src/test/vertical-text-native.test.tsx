import {expect, test} from 'vitest';
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
			(['outer', 'transparent', 'inside-svg'] as const).map((backdrop) => ({
				entry,
				scale,
				backdrop,
			})),
		),
	),
)(
	'matches browser writing mode $entry.id at scale $scale with $backdrop backdrop',
	async ({entry, scale, backdrop}) => {
		await verticalTextFontReady;
		const html = verticalTextNative({
			entry,
			carrier: 'html',
			backdrop: backdrop === 'transparent' ? 'transparent' : 'outer',
		});
		const svg = verticalTextNative({entry, carrier: 'svg', backdrop});
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
			{omitBackground: backdrop === 'transparent'},
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
		const actual = await render(html);
		const svgExport = await render(svg);
		const output = `test/__results__/vertical-text/${server.browser}/${entry.id}/${scale}/${backdrop}`;
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
				backdrop,
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
