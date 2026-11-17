import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {
	svgDefinitionFont,
	svgDefinitionFontUrl,
} from './fixtures/svg-font-definition-review';
import {captureNativeReference, countNativePixels} from './native-reference';

const width = 352;
const height = 120;
const stripLeft = 240;
const mask = svgDefinitionFont({
	mode: 'root-mask',
	fontUrl: svgDefinitionFontUrl,
	backgroundColor: 'transparent',
});
const Mask = mask.component;

const rightStrip = async (image: Blob, scale: number) => {
	const bitmap = await createImageBitmap(
		image,
		stripLeft * scale,
		0,
		(width - stripLeft) * scale,
		height * scale,
	);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	try {
		canvas
			.getContext('2d', {willReadFrequently: true})!
			.drawImage(bitmap, 0, 0);
		return await canvas.convertToBlob({type: 'image/png'});
	} finally {
		bitmap.close();
		canvas.width = 0;
		canvas.height = 0;
	}
};

test.for([
	{id: 'opaque-rounded', translucent: false, opacity: 1, scale: 1},
	{id: 'translucent-rounded', translucent: true, opacity: 1, scale: 1},
	{
		id: 'opaque-group-opacity',
		translucent: false,
		opacity: 0.6,
		scale: 1.25,
	},
	{
		id: 'translucent-group-opacity',
		translucent: true,
		opacity: 0.6,
		scale: 1.25,
	},
])(
	'preserves existing SVG mask destination pixels in $id',
	async (scenario) => {
		const {id, translucent, opacity, scale} = scenario;
		const background = translucent ? '#cbd2fc66' : '#cbd2fc';
		const makeComposition = (withMask: boolean) => ({
			...mask,
			id: `svg-mask-destination-${id}-${withMask ? 'mask' : 'control'}`,
			width,
			height,
			component: () => (
				<div style={{position: 'relative', width, height, background}}>
					<div
						style={{
							position: 'absolute',
							top: 22,
							left: 8,
							right: 12,
							height: 40,
							background: '#32bb574d',
						}}
					/>
					<div
						style={{
							position: 'absolute',
							top: 5,
							left: 254,
							width: 70,
							height: 96,
							background: '#de299a77',
						}}
					/>
					<div
						style={{
							position: 'absolute',
							left: 12,
							top: 8,
							width: 180,
							height: 72,
							overflow: 'hidden',
							borderRadius: 14,
							opacity,
						}}
					>
						{withMask ? <Mask /> : null}
					</div>
				</div>
			),
		});
		const composition = makeComposition(true);
		const controlComposition = makeComposition(false);
		const folder = `test/__results__/svg-mask-destination/${server.browser}/${id}`;
		const archive = async (label: string, png: Blob) => {
			const bytes = Array.from(
				new Uint8Array(await png.arrayBuffer()),
				(byte) => String.fromCharCode(byte),
			).join('');
			await server.commands.writeFile(
				`${folder}/${label}.png`,
				btoa(bytes),
				'base64',
			);
			return png;
		};

		const render = async (withMask: boolean) => {
			const still = await renderStillOnWeb({
				composition: withMask ? composition : controlComposition,
				frame: 1,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				transparent: true,
				scale,
			});
			return still.blob({format: 'png'});
		};

		const actual = await archive('export', await render(true));
		const control = await archive('control', await render(false));
		const stripComparison = await countNativePixels(
			await rightStrip(control, scale),
			await rightStrip(actual, scale),
		);
		expect.soft(stripComparison.mismatchedPixels).toBe(0);
		expect
			.soft((await countNativePixels(control, actual)).mismatchedPixels)
			.toBeGreaterThan(0);

		const native = (source: typeof composition) => {
			const Scene = source.component;
			return captureNativeReference(
				{
					...source,
					width: width * scale,
					height: height * scale,
					component: () => (
						<div
							style={{
								position: 'absolute',
								width,
								height,
								transform: `scale(${scale})`,
								transformOrigin: '0 0',
							}}
						>
							<Scene />
						</div>
					),
				},
				1,
				{omitBackground: translucent},
			);
		};

		const reference = await archive('native', await native(composition));
		const nativeControl = await archive(
			'native-control',
			await native(controlComposition),
		);
		expect
			.soft((await countNativePixels(nativeControl, control)).mismatchedPixels)
			.toBe(0);
		expect((await countNativePixels(reference, actual)).mismatchedPixels).toBe(
			0,
		);
	},
);
