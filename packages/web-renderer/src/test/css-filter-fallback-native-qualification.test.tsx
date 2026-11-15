import {AbsoluteFill} from 'remotion';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {captureNativeReference, compareNativePixels} from './native-reference';

const filters = [
	'none',
	'blur(2px)',
	'brightness(1.3)',
	'contrast(140%)',
	'drop-shadow(6px 4px 0px rgb(0, 100, 200))',
	'grayscale(75%)',
	'hue-rotate(90deg)',
	'invert(30%)',
	'opacity(50%)',
	'saturate(1.5)',
	'sepia(60%)',
	'blur(2px) brightness(1.2) contrast(150%)',
];
for (const [index, filter] of filters.entries())
	for (const scale of [0.75, 1, 2]) {
		const Component = () => (
			<AbsoluteFill style={{background: 'white'}}>
				<div
					style={{
						position: 'absolute',
						left: 32,
						top: 32,
						transform: `scale(${scale})`,
						transformOrigin: '0 0',
					}}
				>
					<div
						style={{
							position: 'relative',
							width: 32,
							height: 24,
							background: 'rgb(40, 80, 160)',
							filter,
						}}
					>
						<div
							style={{
								position: 'absolute',
								left: 24,
								top: 8,
								width: 24,
								height: 16,
								background: 'rgba(220, 60, 20, 0.5)',
							}}
						/>
					</div>
				</div>
			</AbsoluteFill>
		);
		const composition = {
			component: Component,
			id: `filter-fallback-${index}-scale-${scale}`,
			width: 192,
			height: 128,
			fps: 30,
			durationInFrames: 1,
		};
		test(`native CSS filter ${index} ${filter} scale ${scale}`, async () => {
			const reference = await captureNativeReference(composition, 0, {
				omitBackground: false,
			});
			const actual = await (
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition,
					frame: 0,
					inputProps: {},
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
			const result = await compareNativePixels(reference, actual);
			const directory =
				'test/__results__/css-filter-fallback/' +
				server.browser +
				'/' +
				index +
				'-' +
				scale;
			for (const [name, blob] of [
				['reference', reference],
				['actual', actual],
				['diff', result.diff],
			] as const) {
				const bytes = new Uint8Array(await blob.arrayBuffer());
				let binary = '';
				for (const byte of bytes) binary += String.fromCharCode(byte);
				await server.commands.writeFile(
					directory + '/' + name + '.png',
					btoa(binary),
					'base64',
				);
			}

			await server.commands.writeFile(
				directory + '/comparison.json',
				JSON.stringify(
					{
						browser: server.browser,
						platform: server.platform,
						userAgent: navigator.userAgent,
						devicePixelRatio,
						index,
						filter,
						scale,
						width: composition.width,
						height: composition.height,
						canvasFilterSupported:
							'filter' in OffscreenCanvasRenderingContext2D.prototype,
						mismatchedPixels: result.mismatchedPixels,
						maxChannelDelta: result.maxChannelDelta,
					},
					null,
					2,
				),
			);
			expect(result.mismatchedPixels).toBe(0);
		});
	}
