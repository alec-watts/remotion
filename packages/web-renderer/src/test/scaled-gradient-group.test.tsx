import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	scaledGradientGroup,
	scaledGradientGroups,
} from './fixtures/scaled-gradient-group';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	scaledGradientGroups.flatMap((entry) =>
		[1, 1.5].map((scale) => ({entry, scale})),
	),
)(
	'preserves gradient group $entry.id at export scale $scale',
	async ({entry, scale}) => {
		const composition = scaledGradientGroup(entry);
		const Scene = composition.component;
		const native = await captureNativeReference(
			{
				...composition,
				width: composition.width * scale,
				height: composition.height * scale,
				component: () => (
					<div
						style={{
							position: 'absolute',
							width: composition.width,
							height: composition.height,
							transformOrigin: '0 0',
							transform: `scale(${scale})`,
						}}
					>
						<Scene />
					</div>
				),
			},
			0,
			{omitBackground: false},
		);
		const actual = await (
			await renderStillOnWeb({
				composition,
				inputProps: {},
				frame: 0,
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				scale,
			})
		).blob({format: 'png'});
		const output = `test/__results__/scaled-gradient-group/${server.browser}/${entry.id}/${scale}`;
		for (const [name, png] of [
			['native', native],
			['actual', actual],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await png.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${output}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		const result = await countNativePixels(native, actual);
		await server.commands.writeFile(
			`${output}/comparison.json`,
			JSON.stringify(result),
		);
		expect(result.mismatchedPixels).toBe(0);
	},
);
