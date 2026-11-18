import '../symbol-dispose';
import {expect, test} from 'vitest';
import {page} from 'vitest/browser';
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
		expect(result.mismatchedPixels, result.evidence ?? undefined).toBe(0);
	},
);
