import '../symbol-dispose';
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
			const {data} = ctx.getImageData(position.left, position.top, 100, 50);
			expect(data[0]).toBeGreaterThan(250);
			expect(data[3998]).toBe(0);
			expect(data[3999]).toBe(255);
			const shadowX = position.left + position.shadowOffset * 2;
			expect(
				Array.from(
					ctx.getImageData(shadowX + 50, position.top + 20, 1, 1).data,
				),
			).toEqual([0, 0, 255, 255]);
		} finally {
			image.close();
		}
	});
}
