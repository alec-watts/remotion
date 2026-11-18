import '../symbol-dispose';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {supportsNativeHtmlInCanvas} from '../html-in-canvas';
import {renderStillOnWeb} from '../render-still-on-web';
import {filterInputCases} from './fixtures/projective-filter-input';
import {
	projectiveFilterAnchored,
	projectiveFilterSvgCarrier,
} from './fixtures/projective-filter-svg-carrier';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	filterInputCases.flatMap(({kind}) =>
		[false, true].map((preserving) => ({kind, preserving})),
	),
)(
	'compares existing SVG filter inputs $kind preserving=$preserving',
	{timeout: 20_000},
	async ({kind, preserving}) => {
		const composition = projectiveFilterAnchored(kind, preserving);
		const folder = `test/__results__/projective-svg/${server.browser}/${kind}-${preserving}`;
		const modes = [
			'html-default',
			'html-experimental',
			'svg-dom',
			'svg-image',
			'svg-default',
			'svg-experimental',
			'direct',
			'readback',
			'seeded-readback',
			'identity-svg-dom',
			'identity-svg-image',
			'identity-direct',
			'identity-readback',
			'bitmap-direct',
			'bitmap-readback',
			'html-repeat',
		] as const;
		const probes: Record<
			string,
			{error: string | null; mismatchedPixels: number | null}
		> = Object.fromEntries(
			modes.map((mode) => [
				mode,
				{error: 'not-completed', mismatchedPixels: null},
			]),
		);
		const checkpoint = () =>
			server.commands.writeFile(
				`${folder}/comparison.json`,
				JSON.stringify({kind, preserving, frame: 0, probes}),
			);
		const save = async (name: string, blob: Blob) => {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		};

		await checkpoint();
		await server.commands.writeFile(
			`${folder}/native-capability.json`,
			JSON.stringify({
				drawElementImage: supportsNativeHtmlInCanvas(),
				requestPaint:
					typeof (
						document.createElement('canvas') as HTMLCanvasElement & {
							requestPaint?: () => void;
						}
					).requestPaint === 'function',
			}),
		);
		const reference = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		await save('reference', reference);
		const source: {pending: Promise<HTMLImageElement> | null} = {pending: null};
		let disposed = false;
		const owned = new Set<HTMLImageElement>();
		const identitySource: {pending: Promise<HTMLImageElement> | null} = {
			pending: null,
		};
		const ownImage = (pending: Promise<HTMLImageElement>) => {
			pending.then(
				(entry) => {
					if (disposed) entry.removeAttribute('src');
					else owned.add(entry);
				},
				() => {},
			);
		};

		let sourceLayout: unknown = null;
		const carrier = projectiveFilterSvgCarrier(kind, preserving, (element) => {
			if (!element) return;
			const target = element.querySelector<HTMLElement>(
				'[data-projective-filter-source]',
			);
			if (!target) throw new Error('Projective fixture source is missing');
			const style = getComputedStyle(target);
			const parentStyle = getComputedStyle(target.parentElement!);
			const svgStyle = getComputedStyle(element);
			const bounds = target.getBoundingClientRect();
			const svgBounds = element.getBoundingClientRect();
			sourceLayout = {
				transform: style.transform,
				transformOrigin: style.transformOrigin,
				filter: style.filter,
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				color: style.color,
				parentPerspective: parentStyle.perspective,
				parentPerspectiveOrigin: parentStyle.perspectiveOrigin,
				parentTransformStyle: parentStyle.transformStyle,
				svgFontFamily: svgStyle.fontFamily,
				left: bounds.left - svgBounds.left,
				top: bounds.top - svgBounds.top,
				width: bounds.width,
				height: bounds.height,
			};
			source.pending = turnSvgIntoDrawable(element);
			ownImage(source.pending);
		});
		const identityCarrier = projectiveFilterSvgCarrier(
			kind,
			preserving,
			(element) => {
				if (!element) return;
				identitySource.pending = turnSvgIntoDrawable(element);
				ownImage(identitySource.pending);
			},
			true,
		);
		let image: HTMLImageElement | null = null;
		let identityImage: HTMLImageElement | null = null;
		try {
			for (const mode of modes) {
				let bitmap: ImageBitmap | null = null;
				let raster: OffscreenCanvas | null = null;
				let output: OffscreenCanvas | null = null;
				try {
					let blob: Blob;
					if (
						mode === 'html-default' ||
						mode === 'html-experimental' ||
						mode === 'svg-default' ||
						mode === 'svg-experimental'
					) {
						blob = await (
							await renderStillOnWeb({
								composition: mode.startsWith('html-')
									? composition
									: projectiveFilterSvgCarrier(kind, preserving),
								frame: 0,
								inputProps: {},
								licenseKey: 'free-license',
								allowHtmlInCanvas: false,
								transparent: false,
								experimental3DRendering: mode.endsWith('-experimental'),
							})
						).blob({format: 'png'});
					} else if (mode === 'html-repeat') {
						blob = await captureNativeReference(composition, 0, {
							omitBackground: false,
						});
					} else if (mode === 'svg-dom') {
						blob = await captureNativeReference(carrier, 0, {
							omitBackground: false,
						});
						await server.commands.writeFile(
							`${folder}/source-layout.json`,
							JSON.stringify(sourceLayout),
						);
					} else if (mode === 'identity-svg-dom') {
						blob = await captureNativeReference(identityCarrier, 0, {
							omitBackground: false,
						});
					} else {
						const identity = mode.startsWith('identity-');
						const bitmapTransfer = mode.startsWith('bitmap-');
						const transfer = identity
							? mode.slice('identity-'.length)
							: bitmapTransfer
								? mode.slice('bitmap-'.length)
								: mode;
						if (identity && !identityImage) {
							if (!identitySource.pending)
								throw new Error('Identity source did not commit');
							identityImage = await identitySource.pending;
							const prefix = 'data:image/svg+xml;charset=utf-8,';
							expect(identityImage.src.startsWith(prefix)).toBe(true);
							await server.commands.writeFile(
								`${folder}/source-identity.svg`,
								decodeURIComponent(identityImage.src.slice(prefix.length)),
							);
						} else if (!identity && !image) {
							if (!source.pending) throw new Error('SVG source did not commit');
							image = await source.pending;
							const prefix = 'data:image/svg+xml;charset=utf-8,';
							expect(image.src.startsWith(prefix)).toBe(true);
							await server.commands.writeFile(
								`${folder}/source.svg`,
								decodeURIComponent(image.src.slice(prefix.length)),
							);
						}

						const selectedImage = identity ? identityImage : image;
						if (!selectedImage) throw new Error('SVG image is unavailable');
						if (transfer === 'svg-image') {
							const url = selectedImage.src;
							blob = await captureNativeReference(
								{
									...composition,
									id: `${composition.id}-image${identity ? '-identity' : ''}`,
									component: () => (
										<img
											src={url}
											style={{
												display: 'block',
												width: composition.width,
												height: composition.height,
											}}
										/>
									),
								},
								0,
								{omitBackground: false},
							);
						} else {
							raster = new OffscreenCanvas(
								composition.width,
								composition.height,
							);
							const context = raster.getContext('2d', {
								willReadFrequently: transfer !== 'direct',
							})!;
							if (transfer === 'seeded-readback') {
								context.fillStyle = 'white';
								context.fillRect(0, 0, raster.width, raster.height);
							}

							if (bitmapTransfer)
								bitmap = await createImageBitmap(selectedImage);
							context.drawImage(bitmap ?? selectedImage, 0, 0);
							if (transfer === 'direct')
								blob = await raster.convertToBlob({type: 'image/png'});
							else {
								output = new OffscreenCanvas(raster.width, raster.height);
								output
									.getContext('2d')!
									.putImageData(
										context.getImageData(0, 0, raster.width, raster.height),
										0,
										0,
									);
								blob = await output.convertToBlob({type: 'image/png'});
							}
						}
					}

					await save(mode, blob);
					probes[mode] = {
						error: null,
						...(await countNativePixels(reference, blob)),
					};
				} catch (error) {
					probes[mode] = {error: String(error), mismatchedPixels: null};
				} finally {
					bitmap?.close();
					if (raster) {
						raster.width = 0;
						raster.height = 0;
					}

					if (output) {
						output.width = 0;
						output.height = 0;
					}

					await checkpoint();
				}
			}
		} finally {
			disposed = true;
			for (const entry of owned) entry.removeAttribute('src');
		}

		for (const probe of Object.values(probes)) {
			expect.soft(probe.error).toBe(null);
			expect.soft(probe.mismatchedPixels).toBe(0);
		}
	},
);
