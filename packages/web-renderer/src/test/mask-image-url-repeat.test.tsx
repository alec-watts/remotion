import '../symbol-dispose';
import {expect, test} from 'vitest';
import {page} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {maskImageUrlRepeat} from './fixtures/mask-image-url-repeat';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for([0, 1].flatMap((frame) => [1, 2].map((scale) => ({frame, scale}))))(
	'renders raster mask space and round frame=$frame scale=$scale',
	async ({frame, scale}) => {
		await page.viewport(1280, 720);
		const Source = maskImageUrlRepeat.component;
		const reference = await captureNativeReference(
			{
				...maskImageUrlRepeat,
				id: `${maskImageUrlRepeat.id}-reference-${scale}`,
				width: maskImageUrlRepeat.width * scale,
				height: maskImageUrlRepeat.height * scale,
				component: () => (
					<div
						style={{
							position: 'absolute',
							width: maskImageUrlRepeat.width,
							height: maskImageUrlRepeat.height,
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
				composition: maskImageUrlRepeat,
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
