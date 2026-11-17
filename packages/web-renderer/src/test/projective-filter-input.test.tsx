import '../symbol-dispose';
import {AbsoluteFill} from 'remotion';
import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	filterInputCases,
	projectiveFilterInput,
} from './fixtures/projective-filter-input';
import {captureNativeReference, compareNativePixels} from './native-reference';

for (const {kind} of filterInputCases)
	for (const preserving of [false, true])
		for (const experimental3DRendering of [false, true]) {
			test(`retains ${kind} filter inputs preserving=${preserving} experimental=${experimental3DRendering}`, async () => {
				const composition = projectiveFilterInput(kind, preserving);
				const native = await captureNativeReference(composition, 0, {
					omitBackground: false,
				});
				const inputs: Blob[] = [];
				const original = OffscreenCanvas.prototype.convertToBlob;
				const captureInput =
					kind.endsWith('-visible') && experimental3DRendering;
				const spy = captureInput
					? vi
							.spyOn(OffscreenCanvas.prototype, 'convertToBlob')
							.mockImplementation(
								async function (this: OffscreenCanvas, options) {
									const blob = await original.call(this, options);
									if (options?.type === 'image/png') inputs.push(blob);
									return blob;
								},
							)
					: null;
				let actual: Blob;
				try {
					actual = await (
						await renderStillOnWeb({
							composition,
							frame: 0,
							inputProps: {},
							licenseKey: 'free-license',
							allowHtmlInCanvas: false,
							experimental3DRendering,
						})
					).blob({format: 'png'});
				} finally {
					spy?.mockRestore();
				}

				const result = await compareNativePixels(native, actual);
				const path = `test/__results__/filter-inputs/${server.browser}/${composition.id}-${experimental3DRendering}`;
				await Promise.all(
					[native, actual, ...inputs].map(async (blob, index) => {
						let binary = '';
						for (const byte of new Uint8Array(await blob.arrayBuffer()))
							binary += String.fromCharCode(byte);
						await server.commands.writeFile(
							`${path}/${index === 0 ? 'reference' : index === 1 ? 'actual' : 'capture-' + (index - 2)}.png`,
							btoa(binary),
							'base64',
						);
					}),
				);
				await server.commands.writeFile(
					`${path}/comparison.json`,
					JSON.stringify({
						kind,
						preserving,
						experimental3DRendering,
						mismatchedPixels: result.mismatchedPixels,
						maxChannelDelta: result.maxChannelDelta,
						captureCount: inputs.length,
						userAgent: navigator.userAgent,
						devicePixelRatio,
					}),
				);
				expect(result.mismatchedPixels).toBe(0);
			});
		}

for (const readback of [false, true]) {
	for (let y = 0; y < 8; y++) {
		test(`measures visible gradient origin row ${y} with readback=${readback}`, async () => {
			const composition = projectiveFilterInput('gradient-visible', false);
			const native = await captureNativeReference(composition, 0, {
				omitBackground: false,
			});
			const referenceCanvas = new OffscreenCanvas(300, 300);
			const referenceContext = referenceCanvas.getContext('2d')!;
			const referenceImage = await createImageBitmap(native);
			try {
				referenceContext.drawImage(referenceImage, 0, 0);
			} finally {
				referenceImage.close();
			}

			const reference = referenceContext.getImageData(25, 100, 100, 50).data;
			const matrix: {
				x: number;
				y: number;
				readback: boolean;
				wrong: number;
			}[] = [];

			for (let x = 0; x < 8; x++) {
				const canvas = new OffscreenCanvas(232, 56 + 8);
				const ctx = canvas.getContext('2d', {
					willReadFrequently: readback,
				})!;
				ctx.setTransform(2, 0, 0, 1, x, y);
				const gradient = ctx.createLinearGradient(0, 25, 50, 25);
				gradient.addColorStop(0, 'red');
				gradient.addColorStop(1, 'lime');
				ctx.fillStyle = gradient;
				ctx.fillRect(0, 0, 50, 50);
				const image = await createImageBitmap(
					await canvas.convertToBlob({type: 'image/png'}),
				);
				const readCanvas = new OffscreenCanvas(100, 50);
				const read = readCanvas.getContext('2d')!;
				try {
					read.drawImage(image, -x, -y);
				} finally {
					image.close();
				}

				const {data} = read.getImageData(0, 0, 100, 50);
				let wrong = 0;
				for (let i = 0; i < data.length; i += 4) {
					if (
						data[i] !== reference[i] ||
						data[i + 1] !== reference[i + 1] ||
						data[i + 2] !== reference[i + 2] ||
						data[i + 3] !== reference[i + 3]
					)
						wrong++;
				}

				matrix.push({x, y, readback, wrong});
				canvas.width = 0;
				readCanvas.width = 0;
			}

			await server.commands.writeFile(
				`test/__results__/filter-inputs/${server.browser}/${composition.id}-true/paint-origins-${readback}-${y}.json`,
				JSON.stringify({
					matrix,
					nativePixels: btoa(String.fromCharCode(...reference)),
				}),
			);
		});
	}
}

const nativeGradientPositions = [
	{left: 26, top: 100, shadowOffset: 60},
	{left: 25, top: 101, shadowOffset: 60},
	{left: 32, top: 107, shadowOffset: 60},
	{left: 33, top: 108, shadowOffset: 60},
	{left: 25, top: 100, shadowOffset: 61},
	{left: 145, top: 100, shadowOffset: -60},
];

for (const position of nativeGradientPositions) {
	test(`captures native gradient at ${position.left},${position.top} with shadow ${position.shadowOffset}`, async () => {
		const composition = projectiveFilterInput(
			'gradient-visible',
			false,
			position,
		);
		const native = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const bytes = new Uint8Array(await native.arrayBuffer());
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`test/__results__/native-gradient-origins/${server.browser}/${composition.id}.png`,
			btoa(binary),
			'base64',
		);
		const image = await createImageBitmap(native);
		try {
			expect(image.width).toBe(300);
			expect(image.height).toBe(300);
			const canvas = new OffscreenCanvas(300, 300);
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(image, 0, 0);
			const interiorY = position.top + 20;
			const red = ctx.getImageData(position.left + 10, interiorY, 1, 1).data;
			const green = ctx.getImageData(position.left + 89, interiorY, 1, 1).data;
			expect(red[0]).toBeGreaterThan(red[1]);
			expect(green[1]).toBeGreaterThan(green[0]);
			expect(red[3]).toBe(255);
			expect(green[3]).toBe(255);
			const shadowX = position.left + position.shadowOffset * 2;
			expect(
				Array.from(
					ctx.getImageData(shadowX + 50, position.top + 20, 1, 1).data,
				),
			).toEqual([0, 0, 255, 255]);
		} finally {
			image.close();
		}

		const actual = await (
			await renderStillOnWeb({
				composition,
				frame: 0,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				experimental3DRendering: true,
			})
		).blob({format: 'png'});
		const result = await compareNativePixels(native, actual);
		await server.commands.writeFile(
			`test/__results__/native-gradient-origins/${server.browser}/${composition.id}.json`,
			JSON.stringify({
				mismatchedPixels: result.mismatchedPixels,
				maxChannelDelta: result.maxChannelDelta,
			}),
		);
		expect(result.mismatchedPixels).toBe(0);
	});
}

const gradientPaintVariants = [
	{
		id: 'opaque-horizontal',
		gradient: '90deg, red, lime',
		width: 50,
		height: 50,
		left: 25,
		top: 100,
		transform: 'scaleX(2)',
	},
	{
		id: 'vertical-odd-size',
		gradient: '0deg, red, lime',
		width: 37,
		height: 53,
		left: 25,
		top: 100,
		transform: 'scaleX(2)',
	},
	{
		id: 'oblique',
		gradient: '37deg, red, lime',
		width: 43,
		height: 49,
		left: 19,
		top: 98,
		transform: 'scaleX(2)',
	},
	{
		id: 'three-stops',
		gradient: '90deg, red 0%, blue 38%, lime 100%',
		width: 44,
		height: 45,
		left: 24,
		top: 103,
		transform: 'scaleX(2)',
	},
	{
		id: 'translucent-stops',
		gradient: '90deg, rgb(255 0 0 / 50%), rgb(0 255 0 / 70%)',
		width: 50,
		height: 50,
		left: 25,
		top: 100,
		transform: 'scaleX(2)',
	},
	{
		id: 'vertical-raster',
		gradient: '125deg, red, lime',
		width: 46,
		height: 55,
		left: 18,
		top: 61,
		transform: 'scaleY(2)',
	},
	{
		id: 'reflected',
		gradient: '90deg, red, lime',
		width: 50,
		height: 50,
		left: 250,
		top: 100,
		transform: 'scaleX(-2)',
	},
	{
		id: 'fractional-local-width',
		gradient: '90deg, red, lime',
		width: 37.5,
		height: 50,
		left: 25,
		top: 100,
		transform: 'scaleX(2)',
	},
	{
		id: 'fractional-translation',
		gradient: '90deg, red, lime',
		width: 50,
		height: 50,
		left: 25.25,
		top: 100.5,
		transform: 'scaleX(2)',
	},
	{
		id: 'fractional-raster',
		gradient: '135deg, red, lime',
		width: 44,
		height: 36,
		left: 36,
		top: 90,
		transform: 'scale(1.5, 1.25)',
	},
] as const;

for (const {id, gradient, ...geometry} of gradientPaintVariants) {
	test(`matches native filtered gradient geometry ${id}`, async () => {
		const composition = {
			component: () => (
				<AbsoluteFill style={{backgroundColor: 'white'}}>
					<div
						style={{
							...geometry,
							position: 'absolute',
							transformOrigin: '0 0',
							filter: 'drop-shadow(60px 0 0 blue)',
							backgroundColor: 'red',
							backgroundImage: `linear-gradient(${gradient})`,
						}}
					/>
				</AbsoluteFill>
			),
			id: `filtered-gradient-${id}`,
			width: 300,
			height: 300,
			fps: 30,
			durationInFrames: 1,
		};
		const reference = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const actual = await (
			await renderStillOnWeb({
				composition,
				frame: 0,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				experimental3DRendering: true,
			})
		).blob({format: 'png'});
		const dir = `test/__results__/gradient-paint-matrix/${server.browser}/${id}`;
		await Promise.all(
			[reference, actual].map(async (blob, index) => {
				let binary = '';
				for (const byte of new Uint8Array(await blob.arrayBuffer()))
					binary += String.fromCharCode(byte);
				await server.commands.writeFile(
					`${dir}/${index === 0 ? 'reference' : 'actual'}.png`,
					btoa(binary),
					'base64',
				);
			}),
		);
		const native = await createImageBitmap(reference);
		try {
			const matrix = new DOMMatrix(geometry.transform);
			const x = Math.floor(geometry.left + (matrix.a * geometry.width) / 2);
			const y = Math.floor(geometry.top + (matrix.d * geometry.height) / 2);
			const sample = new OffscreenCanvas(1, 1).getContext('2d')!;
			sample.drawImage(native, -x, -y);
			expect(Array.from(sample.getImageData(0, 0, 1, 1).data)).not.toEqual([
				255, 255, 255, 255,
			]);
		} finally {
			native.close();
		}

		const result = await compareNativePixels(reference, actual);
		expect(result.mismatchedPixels).toBe(0);
	});
}
