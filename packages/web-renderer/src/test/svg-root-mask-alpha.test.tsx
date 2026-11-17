import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgDefinitionFont,
	svgDefinitionFontUrl,
} from './fixtures/svg-font-definition-review';
import {captureNativeReference, countNativePixels} from './native-reference';

const paintOnWhite = async (blob: Blob) => {
	const bitmap = await createImageBitmap(blob);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	try {
		const context = canvas.getContext('2d', {willReadFrequently: true});
		if (!context) throw new Error('Cannot create replay context');
		context.fillStyle = 'white';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bitmap, 0, 0);
		return await canvas.convertToBlob({type: 'image/png'});
	} finally {
		bitmap.close();
		canvas.width = 0;
		canvas.height = 0;
	}
};

const alternativePaths = ['readback', 'readback-transfer'] as const;
type CanvasPath = 'canvas' | (typeof alternativePaths)[number];

const drawSvgImage = async (
	image: HTMLImageElement,
	onWhite: boolean,
	path: CanvasPath,
) => {
	const {naturalWidth, naturalHeight} = image;
	const canvas = new OffscreenCanvas(naturalWidth, naturalHeight);
	const scratch =
		path === 'readback-transfer'
			? new OffscreenCanvas(naturalWidth, naturalHeight)
			: null;
	try {
		const context = canvas.getContext('2d', {
			alpha: true,
			willReadFrequently: path === 'readback',
		});
		if (!context) throw new Error('Cannot create drawable canvas');
		if (onWhite) {
			context.fillStyle = 'white';
			context.fillRect(0, 0, canvas.width, canvas.height);
		}

		if (scratch) {
			const source = scratch.getContext('2d', {
				alpha: true,
				willReadFrequently: true,
			});
			if (!source) throw new Error('Cannot create readback scratch context');
			source.drawImage(image, 0, 0);
			context.drawImage(scratch, 0, 0);
		} else {
			context.drawImage(image, 0, 0);
		}

		return await canvas.convertToBlob({type: 'image/png'});
	} finally {
		if (scratch) {
			scratch.width = 0;
			scratch.height = 0;
		}

		canvas.width = 0;
		canvas.height = 0;
	}
};

test.for(
	(['root-mask', 'filter-image'] as const).flatMap((mode) =>
		[0, 1].map((frame) => ({mode, frame})),
	),
)(
	'compares SVG $mode alpha and white matting on frame $frame',
	async ({mode, frame}) => {
		const composition = (backgroundColor: string) =>
			svgDefinitionFont({mode, fontUrl: svgDefinitionFontUrl, backgroundColor});
		const clear = composition('transparent');
		const white = composition('white');
		const exportPng = async (comp: typeof clear) =>
			(
				await renderStillOnWeb({
					composition: comp,
					inputProps: {},
					licenseKey: 'free-license',
					frame,
					allowHtmlInCanvas: false,
					transparent: true,
				})
			).blob({format: 'png'});
		const folder = `test/__results__/svg-root-mask-alpha/${server.browser}/${mode}/${frame}`;
		const images = new Map<string, Blob>();
		const errors: Record<string, string> = {};
		const capture = async (label: string, make: () => Promise<Blob>) => {
			try {
				const blob = await make();
				let bytes = '';
				for (const byte of new Uint8Array(await blob.arrayBuffer())) {
					bytes += String.fromCharCode(byte);
				}

				await server.commands.writeFile(
					`${folder}/${label}.png`,
					btoa(bytes),
					'base64',
				);
				images.set(label, blob);
			} catch (error) {
				errors[label] = String(error);
			}
		};

		await capture('native-white', () =>
			captureNativeReference(white, frame, {omitBackground: false}),
		);
		await capture('export-white', () => exportPng(white));
		await capture('native-clear', () =>
			captureNativeReference(clear, frame, {omitBackground: true}),
		);
		const drawables: Blob[] = [];
		let embeddedFont = false;
		const createObjectURL = URL.createObjectURL.bind(URL);
		const observeDrawable = vi
			.spyOn(URL, 'createObjectURL')
			.mockImplementation((input) => {
				if (input instanceof Blob && input.type.startsWith('image/svg+xml')) {
					drawables.push(input);
				}

				return createObjectURL(input);
			});
		try {
			await capture('export-clear', () => exportPng(clear));
		} finally {
			observeDrawable.mockRestore();
		}

		if (drawables.length !== 1) {
			errors['serialized-svg'] =
				`Expected one SVG drawable, got ${drawables.length}`;
		} else {
			const blob = drawables[0]!;
			const markup = await blob.text();
			const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
			embeddedFont = markup.includes('data:font/woff2;');
			if (
				parsed.documentElement.localName !== 'svg' ||
				(mode === 'root-mask' && !embeddedFont)
			) {
				errors['serialized-svg'] =
					'The captured drawable is missing the expected embedded font';
			} else {
				await server.commands.writeFile(`${folder}/serialized.svg`, markup);
				const url = URL.createObjectURL(blob);
				const image = new Image();
				try {
					image.src = url;
					await image.decode();
					if (
						image.naturalWidth !== clear.width ||
						image.naturalHeight !== clear.height
					) {
						throw new Error(
							`Unexpected intrinsic SVG size ${image.naturalWidth}×${image.naturalHeight}`,
						);
					}

					for (const backgroundColor of ['white', 'transparent']) {
						const onWhite = backgroundColor === 'white';
						const suffix = onWhite ? 'white' : 'clear';
						await capture(`image-${suffix}`, () =>
							captureNativeReference(
								{
									...clear,
									component: () => (
										<div
											style={{
												backgroundColor,
												width: clear.width,
												height: clear.height,
											}}
										>
											<img
												src={url}
												width={clear.width}
												height={clear.height}
												style={{display: 'block'}}
												alt=""
											/>
										</div>
									),
								},
								frame,
								{omitBackground: !onWhite},
							),
						);
						for (const path of ['canvas', ...alternativePaths] as const) {
							await capture(`${path}-${suffix}`, () =>
								drawSvgImage(image, onWhite, path),
							);
						}
					}

					await capture('inline-serialized-white', () =>
						captureNativeReference(
							{
								...white,
								component: () => (
									<div
										ref={(host) => {
											host?.replaceChildren(
												document.importNode(parsed.documentElement, true),
											);
										}}
										style={{
											background: 'white',
											width: white.width,
											height: white.height,
										}}
									/>
								),
							},
							frame,
							{omitBackground: false},
						),
					);
				} catch (error) {
					errors['serialized-svg'] = String(error);
				} finally {
					URL.revokeObjectURL(url);
				}
			}
		}

		for (const source of ['native', 'export']) {
			const clearPng = images.get(`${source}-clear`);
			if (clearPng) {
				await capture(`${source}-replay`, () => paintOnWhite(clearPng));
			}
		}

		const counts: Record<string, number | null> = {};
		for (const [a, b] of [
			['native-white', 'export-white'],
			['native-clear', 'export-clear'],
			['native-white', 'native-replay'],
			['export-white', 'export-replay'],
			['native-replay', 'export-replay'],
			['native-white', 'inline-serialized-white'],
			['native-white', 'image-white'],
			['native-clear', 'image-clear'],
			['image-white', 'canvas-white'],
			['image-clear', 'canvas-clear'],
			['canvas-white', 'export-white'],
			['canvas-clear', 'export-clear'],
			...alternativePaths.flatMap((path) => [
				['native-white', `${path}-white`],
				['native-clear', `${path}-clear`],
			]),
		]) {
			const before = images.get(a);
			const after = images.get(b);
			counts[`${a} vs ${b}`] =
				before && after
					? (await countNativePixels(before, after)).mismatchedPixels
					: null;
		}

		await server.commands.writeFile(
			`${folder}/summary.json`,
			JSON.stringify({
				counts,
				errors,
				drawableCount: drawables.length,
				embeddedFont,
			}),
		);
		expect.soft(errors['serialized-svg']).toBeUndefined();
		for (const label of [
			'image-white',
			'canvas-white',
			'canvas-clear',
			'inline-serialized-white',
		]) {
			expect.soft(images.has(label), label).toBe(true);
		}

		expect.soft(counts['native-white vs export-white']).toBe(0);
		expect.soft(counts['native-clear vs export-clear']).toBe(0);
	},
);
