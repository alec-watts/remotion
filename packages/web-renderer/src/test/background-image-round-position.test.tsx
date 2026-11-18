import '../symbol-dispose';
import {expect, test} from 'vitest';
import {page, server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {backgroundImageRoundPosition} from './fixtures/background-image-round-position';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for([0, 1].flatMap((frame) => [1, 2].map((scale) => ({frame, scale}))))(
	'positions rounded raster backgrounds frame=$frame scale=$scale',
	async ({frame, scale}) => {
		await page.viewport(1280, 720);
		const Source = backgroundImageRoundPosition.component;
		const reference = await captureNativeReference(
			{
				...backgroundImageRoundPosition,
				id: `${backgroundImageRoundPosition.id}-reference-${scale}`,
				width: backgroundImageRoundPosition.width * scale,
				height: backgroundImageRoundPosition.height * scale,
				component: () => (
					<div
						style={{
							position: 'absolute',
							width: backgroundImageRoundPosition.width,
							height: backgroundImageRoundPosition.height,
							transform: `scale(${scale})`,
							transformOrigin: '0 0',
						}}
					>
						<Source />
					</div>
				),
			},
			frame,
			{omitBackground: false},
		);
		const actual = await (
			await renderStillOnWeb({
				composition: backgroundImageRoundPosition,
				frame,
				scale,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				transparent: false,
			})
		).blob({format: 'png'});
		const result = await compareNativePixels(reference, actual);
		const folder = `test/__results__/round-position/${server.browser}/${frame}-${scale}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify({
				frame,
				scale,
				browser: server.browser,
				userAgent: navigator.userAgent,
				...result,
			}),
		);
		expect(result.mismatchedPixels, result.evidence ?? undefined).toBe(0);
	},
);
