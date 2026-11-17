import '../symbol-dispose';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {projectiveFilterInput} from './fixtures/projective-filter-input';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	[false, true].flatMap((preserving) =>
		[1, 1.5].flatMap((scale) =>
			[1, 2].map((horizontalScale) => ({preserving, scale, horizontalScale})),
		),
	),
)(
	'compares text and shadow at preserving=$preserving scale=$scale horizontalScale=$horizontalScale',
	async ({preserving, scale, horizontalScale}) => {
		const geometry = {
			transform: horizontalScale === 1 ? 'none' : 'scaleX(2)',
		};
		const filtered = projectiveFilterInput(
			'text-visible',
			preserving,
			null,
			'filtered',
			geometry,
		);
		const source = projectiveFilterInput(
			'text-visible',
			preserving,
			null,
			'source-only',
			geometry,
		);
		const layered = projectiveFilterInput(
			'text-visible',
			preserving,
			null,
			'source-only',
			{...geometry, willChange: 'transform'},
		);
		const shifted = projectiveFilterInput(
			'text-visible',
			preserving,
			{left: 25 + 60 * horizontalScale, top: 100, shadowOffset: 60},
			'blue-text',
			geometry,
		);
		const native = (composition: typeof filtered) => {
			const Scene = composition.component;
			return captureNativeReference(
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
		};

		const render = async (composition: typeof filtered) =>
			(
				await renderStillOnWeb({
					composition,
					frame: 0,
					licenseKey: 'free-license',
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering: true,
					scale,
				})
			).blob({format: 'png'});
		const nativeFiltered = await native(filtered);
		const actualFiltered = await render(filtered);
		const nativeSource = await native(source);
		const actualSource = await render(source);
		const nativeShifted = await native(shifted);
		const nativeLayered = await native(layered);

		const folder = `test/__results__/text-shadow-source/${server.browser}/${preserving}/${scale}/${horizontalScale}`;
		for (const [name, blob] of Object.entries({
			nativeFiltered,
			actualFiltered,
			nativeSource,
			actualSource,
			nativeShifted,
			nativeLayered,
		})) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		expect
			.soft(
				(await countNativePixels(nativeFiltered, actualFiltered))
					.mismatchedPixels,
			)
			.toBe(0);
		expect
			.soft(
				(await countNativePixels(nativeSource, actualSource)).mismatchedPixels,
			)
			.toBe(0);
	},
);
