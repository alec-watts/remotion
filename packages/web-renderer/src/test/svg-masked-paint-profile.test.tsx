import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {svgFontFamilyLifetimeReady} from './fixtures/svg-font-family-lifetime';
import {
	svgMaskedPaintModes,
	svgMaskedPaintProfile,
	svgMaskedPaintProfiles,
} from './fixtures/svg-masked-paint-profile';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	svgMaskedPaintProfiles.flatMap((profile) =>
		svgMaskedPaintModes.flatMap((mask) =>
			[1, 1.25].map((scale) => ({profile, mask, scale})),
		),
	),
)(
	'compares $profile SVG paint with $mask at scale $scale',
	async ({profile, mask, scale}) => {
		await svgFontFamilyLifetimeReady;
		const composition = svgMaskedPaintProfile({profile, mask});
		const Scene = composition.component;
		const actual = await (
			await renderStillOnWeb({
				composition,
				frame: 0,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				scale,
			})
		).blob({format: 'png'});
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
		const folder = `test/__results__/svg-masked-paint-profile/${server.browser}/${profile}-${mask}-${scale}`;
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
	},
);
