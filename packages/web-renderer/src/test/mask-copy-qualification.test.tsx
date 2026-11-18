import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {maskCopyOffsets, maskCopyOverflow} from './fixtures/mask-copy-overflow';
import {captureNativeReference, countNativePixels} from './native-reference';

const qualifyMaskCopy = async ({
	mode,
	overflow,
	scale,
	frame,
	opaqueReference,
	position,
	captureStages,
}: {
	mode: 'hard' | 'soft' | 'fractional' | 'translucent';
	overflow: 'hidden' | 'visible';
	scale: number;
	frame: number;
	opaqueReference: boolean;
	position: {left: number; top: number} | null;
	captureStages: boolean;
}) => {
	const composition = maskCopyOverflow({mode, overflow, position});
	const Component = composition.component;
	const captureAtScale = (layoutZoom: boolean) =>
		captureNativeReference(
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
							...(layoutZoom
								? {zoom: scale}
								: {transform: `scale(${scale})`, transformOrigin: '0 0'}),
						}}
					>
						<Component />
					</div>
				),
			},
			frame,
			{omitBackground: !opaqueReference},
		);
	const reference = await captureAtScale(false);
	const serializedSvgs: string[] = [];
	const serialize = XMLSerializer.prototype.serializeToString;
	const observer = vi
		.spyOn(XMLSerializer.prototype, 'serializeToString')
		.mockImplementation(function (this: XMLSerializer, root: Node) {
			const serialized = serialize.call(this, root);
			if (root instanceof SVGSVGElement) serializedSvgs.push(serialized);
			return serialized;
		});
	let actual: Blob;
	try {
		actual = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition,
				frame,
				scale,
				inputProps: {},
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
	} finally {
		observer.mockRestore();
	}

	const pixels = await countNativePixels(reference, actual);
	const nativeZoom =
		position && CSS.supports('zoom', String(scale))
			? await captureAtScale(true)
			: null;
	const path = `test/__results__/mask-copy/${server.browser}/${opaqueReference ? 'opaque-' : ''}${mode}-${overflow}-${scale}-${frame}${position ? `-offset-${position.left}-${position.top}` : ''}${captureStages ? '-stages' : ''}`;
	const savePng = async (role: string, blob: Blob) => {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`${path}/${role}.png`,
			btoa(binary),
			'base64',
		);
	};

	for (const [role, blob] of [
		['reference', reference],
		['actual', actual],
		['native-zoom', nativeZoom],
	] as const) {
		if (blob === null) continue;

		await savePng(role, blob);
	}

	for (const [index, svg] of serializedSvgs.entries()) {
		await server.commands.writeFile(`${path}/serialized-${index}.svg`, svg);
	}

	await server.commands.writeFile(
		`${path}/comparison.json`,
		JSON.stringify({
			...pixels,
			userAgent: navigator.userAgent,
			devicePixelRatio,
			scale,
			frame,
			mode,
			overflow,
			opaqueReference,
			position,
			allowHtmlInCanvas: false,
		}),
	);
	if (captureStages) {
		expect(serializedSvgs).toHaveLength(1);
		const image = new Image();
		try {
			image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializedSvgs[0])}`;
			await image.decode();
			for (const willReadFrequently of [true, false]) {
				const target = new OffscreenCanvas(
					image.naturalWidth,
					image.naturalHeight,
				);
				const backend = willReadFrequently ? 'readback' : 'default';
				try {
					const ctx = target.getContext('2d', {willReadFrequently})!;
					ctx.drawImage(image, 0, 0);
					await savePng(`mask-direct-${backend}`, await target.convertToBlob());
					ctx.globalCompositeOperation = 'copy';
					ctx.fillStyle = '#4078c0';
					ctx.fillRect(0, 0, target.width, target.height);
					ctx.globalCompositeOperation = 'destination-in';
					ctx.drawImage(image, 0, 0);
					await savePng(
						`mask-applied-${backend}`,
						await target.convertToBlob(),
					);
				} finally {
					target.width = 0;
					target.height = 0;
				}
			}
		} finally {
			image.removeAttribute('src');
		}
	}

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
	async (options) =>
		qualifyMaskCopy({
			...options,
			opaqueReference: false,
			position: null,
			captureStages: false,
		}),
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
		qualifyMaskCopy({
			...options,
			mode: 'hard',
			opaqueReference: true,
			position: null,
			captureStages: false,
		}),
);

test.for(
	[0.75, 1.5, 1.75, 2.5, 3].flatMap((scale) => [
		{scale, mode: 'soft' as const, overflow: 'hidden' as const},
		{scale, mode: 'fractional' as const, overflow: 'visible' as const},
	]),
)(
	'keeps mask copy pixels at scale $scale for $mode $overflow',
	async (options) =>
		qualifyMaskCopy({
			...options,
			frame: 0,
			opaqueReference: false,
			position: null,
			captureStages: false,
		}),
);

test.for(
	[1.75, 2.5].flatMap((scale) =>
		maskCopyOffsets.map((position) => ({scale, position})),
	),
)(
	'keeps mask pixels at scale $scale and offset $position.left,$position.top',
	async ({scale, position}) =>
		qualifyMaskCopy({
			scale,
			position,
			mode: 'fractional',
			overflow: 'visible',
			frame: 0,
			opaqueReference: false,
			captureStages: false,
		}),
);

test.for(
	[0.75, 1.25, 1.75, 2.5].flatMap((scale) => [
		{scale, mode: 'soft' as const, overflow: 'hidden' as const},
		{scale, mode: 'fractional' as const, overflow: 'visible' as const},
	]),
)(
	'qualifies intermediate mask alpha at scale $scale for $mode $overflow',
	async (options) =>
		qualifyMaskCopy({
			...options,
			frame: 0,
			opaqueReference: false,
			position: null,
			captureStages: true,
		}),
);

test.for([1.25, 1.75, 2.5])(
	'applies the mask to partially transparent source pixels at scale %s',
	async (scale) =>
		qualifyMaskCopy({
			scale,
			mode: 'translucent',
			overflow: 'visible',
			frame: 0,
			opaqueReference: false,
			position: null,
			captureStages: false,
		}),
);
