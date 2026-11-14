import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {maskCopyOverflow} from './fixtures/mask-copy-overflow';
import {captureNativeReference, countNativePixels} from './native-reference';

const qualifyMaskCopy = async ({
	mode,
	overflow,
	scale,
	frame,
	opaqueReference,
}: {
	mode: 'hard' | 'soft' | 'fractional';
	overflow: 'hidden' | 'visible';
	scale: number;
	frame: number;
	opaqueReference: boolean;
}) => {
	const composition = maskCopyOverflow({mode, overflow});
	const Component = composition.component;
	const reference = await captureNativeReference(
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
					<Component />
				</div>
			),
		},
		frame,
		{omitBackground: !opaqueReference},
	);
	const actual = await (
		await renderStillOnWeb({
			licenseKey: 'free-license',
			composition,
			frame,
			scale,
			inputProps: {},
			allowHtmlInCanvas: false,
		})
	).blob({format: 'png'});
	const pixels = await countNativePixels(reference, actual);
	const path = `test/__results__/mask-copy/${server.browser}/${opaqueReference ? 'opaque-' : ''}${mode}-${overflow}-${scale}-${frame}`;
	for (const [role, blob] of [
		['reference', reference],
		['actual', actual],
	] as const) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`${path}/${role}.png`,
			btoa(binary),
			'base64',
		);
	}

	await server.commands.writeFile(
		`${path}/comparison.json`,
		JSON.stringify(pixels),
	);
	expect.soft(pixels.mismatchedPixels).toBe(0);
	if (mode === 'hard' && scale !== 1.25) {
		const bitmap = await createImageBitmap(actual);
		try {
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext('2d')!;
			context.drawImage(bitmap, 0, 0);
			const {data} = context.getImageData(0, 0, bitmap.width, bitmap.height);
			let wrong = 0;
			for (let y = 0; y < bitmap.height; y++)
				for (let x = 0; x < bitmap.width; x++) {
					const i = (y * bitmap.width + x) * 4;
					const blue = x < (50 - frame * 10) * scale;
					if (
						data[i] !== (blue ? 0 : 255) ||
						data[i + 1] !== 0 ||
						data[i + 2] !== (blue ? 255 : 0) ||
						data[i + 3] !== 255
					)
						wrong++;
				}

			expect(wrong).toBe(0);
		} finally {
			bitmap.close();
		}
	}
};

test.for(
	(['hard', 'soft', 'fractional'] as const).flatMap((mode) =>
		(['hidden', 'visible'] as const).flatMap((overflow) =>
			[1, 1.25, 2].flatMap((scale) =>
				[0, 1].map((frame) => ({mode, overflow, scale, frame})),
			),
		),
	),
)(
	'keeps mask copy pixels mode=$mode overflow=$overflow scale=$scale frame=$frame',
	async (options) => qualifyMaskCopy({...options, opaqueReference: false}),
);

test.for(
	(['hidden', 'visible'] as const).flatMap((overflow) =>
		[1, 2].flatMap((scale) =>
			[0, 1].map((frame) => ({overflow, scale, frame})),
		),
	),
)(
	'keeps fully opaque mask pixels overflow=$overflow scale=$scale frame=$frame',
	async (options) =>
		qualifyMaskCopy({...options, mode: 'hard', opaqueReference: true}),
);
