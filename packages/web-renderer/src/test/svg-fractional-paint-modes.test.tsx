import {useLayoutEffect, useRef} from 'react';
import {beforeAll, expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgViewportMedia} from './fixtures/svg-viewport-media';
import {captureNativeReference, compareNativePixels} from './native-reference';

const modes = [
	{
		id: 'whole-frame-svg',
		rasterScale: null,
		logicalSize: false,
		readback: false,
	},
	{
		id: 'padded-svg-nodes',
		rasterScale: null,
		logicalSize: false,
		readback: false,
	},
	...[null, 1.25, 2, 4].map((rasterScale) => ({
		id: rasterScale === null ? 'bitmap-native' : 'bitmap-raster-' + rasterScale,
		rasterScale,
		logicalSize: rasterScale !== null,
		readback: false,
	})),
	{id: 'unchanged', rasterScale: null, logicalSize: false, readback: false},
	{
		id: 'flatten-svg-transform',
		rasterScale: null,
		logicalSize: false,
		readback: false,
	},
	{id: 'data-uri', rasterScale: null, logicalSize: false, readback: false},
	{
		id: 'software-canvas',
		rasterScale: null,
		logicalSize: false,
		readback: false,
	},
	{id: 'text-readback', rasterScale: null, logicalSize: false, readback: true},
	...[1.25, 2, 4].flatMap((rasterScale) =>
		[false, true].map((logicalSize) => ({
			id: 'raster-' + rasterScale + (logicalSize ? '-logical-size' : ''),
			rasterScale,
			logicalSize,
			readback: false,
		})),
	),
	{
		id: 'raster-1.25-logical-readback',
		rasterScale: 1.25,
		logicalSize: true,
		readback: true,
	},
] as const;
const MediaComponent = svgViewportMedia.component;
const ReadbackComponent = () => {
	const host = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const texts = Array.from(host.current!.querySelectorAll('svg'), (svg) => {
			const text = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			svg.appendChild(text);
			return text;
		});
		return () => {
			for (const text of texts) text.remove();
		};
	}, []);
	return (
		<div ref={host} style={{position: 'absolute', width: 400, height: 160}}>
			<MediaComponent />
		</div>
	);
};

let reference: Blob;
beforeAll(async () => {
	reference = await captureNativeReference(
		{
			...svgViewportMedia,
			id: 'svg-viewport-media-fractional',
			width: 500,
			height: 200,
			component: () => (
				<div
					style={{
						position: 'absolute',
						width: 400,
						height: 160,
						transform: 'scale(1.25)',
						transformOrigin: '0 0',
					}}
				>
					<MediaComponent />
				</div>
			),
		},
		0,
		{
			omitBackground: false,
		},
	);
});

for (const mode of modes) {
	test('SVG fractional painting ' + mode.id, async () => {
		const descriptor = Object.getOwnPropertyDescriptor(
			HTMLImageElement.prototype,
			'src',
		);
		if (!descriptor?.set || !descriptor.get)
			throw new Error('Image src setter unavailable');
		const drawDescriptor = Object.getOwnPropertyDescriptor(
			OffscreenCanvasRenderingContext2D.prototype,
			'drawImage',
		);
		if (!drawDescriptor?.value)
			throw new Error('Canvas draw method unavailable');
		const contextDescriptor = Object.getOwnPropertyDescriptor(
			OffscreenCanvas.prototype,
			'getContext',
		);
		if (!contextDescriptor?.value)
			throw new Error('Canvas context method unavailable');
		const bitmapMode = mode.id.startsWith('bitmap-');
		const bitmaps = new WeakMap<HTMLImageElement, ImageBitmap>();
		const createdBitmaps: ImageBitmap[] = [];
		const bitmapSizes: {width: number; height: number}[] = [];
		const bitmapErrors: string[] = [];
		const assembled: string[] = [];
		let disposed = false;
		const directory = `test/__results__/svg-edge-paint/${server.browser}/${mode.id}`;
		const captured: string[] = [];
		const imageSizes: {
			width: number;
			height: number;
			naturalWidth: number;
			naturalHeight: number;
		}[] = [];
		let actual: Blob;
		try {
			if (bitmapMode)
				Object.defineProperty(
					OffscreenCanvasRenderingContext2D.prototype,
					'drawImage',
					{
						...drawDescriptor,
						value(
							this: OffscreenCanvasRenderingContext2D,
							image: CanvasImageSource,
							...args: number[]
						) {
							if (image instanceof HTMLImageElement) {
								const bitmap = bitmaps.get(image);
								if (!bitmap)
									throw new Error('SVG bitmap was not prepared before drawing');
								return drawDescriptor.value.call(this, bitmap, ...args);
							}

							return drawDescriptor.value.call(this, image, ...args);
						},
					},
				);
			if (mode.id === 'flatten-svg-transform')
				Object.defineProperty(
					OffscreenCanvasRenderingContext2D.prototype,
					'drawImage',
					{
						...drawDescriptor,
						value(
							this: OffscreenCanvasRenderingContext2D,
							image: CanvasImageSource,
							...args: number[]
						) {
							const matrix = this.getTransform();
							if (
								image instanceof HTMLImageElement &&
								args.length === 4 &&
								matrix.b === 0 &&
								matrix.c === 0 &&
								matrix.a > 0 &&
								matrix.d > 0
							) {
								this.save();
								try {
									this.resetTransform();
									return drawDescriptor.value.call(
										this,
										image,
										args[0]! * matrix.a + matrix.e,
										args[1]! * matrix.d + matrix.f,
										args[2]! * matrix.a,
										args[3]! * matrix.d,
									);
								} finally {
									this.restore();
								}
							}

							return drawDescriptor.value.call(this, image, ...args);
						},
					},
				);
			if (mode.id === 'software-canvas')
				Object.defineProperty(OffscreenCanvas.prototype, 'getContext', {
					...contextDescriptor,
					value(
						this: OffscreenCanvas,
						type: string,
						options: object | undefined,
					) {
						return contextDescriptor.value.call(
							this,
							type,
							type === '2d' ? {...options, willReadFrequently: true} : options,
						);
					},
				});
			Object.defineProperty(HTMLImageElement.prototype, 'src', {
				...descriptor,
				get(this: HTMLImageElement) {
					return descriptor.get!.call(this);
				},
				set(this: HTMLImageElement, value: string) {
					if (
						value.startsWith('blob:') &&
						mode.id !== 'unchanged' &&
						mode.id !== 'software-canvas' &&
						mode.id !== 'flatten-svg-transform' &&
						mode.id !== 'bitmap-native'
					) {
						fetch(value)
							.then((response) => response.blob())
							.then(async (blob) => {
								if (!blob.type.startsWith('image/svg+xml'))
									throw new Error('Unexpected blob type: ' + blob.type);
								this.src =
									'data:image/svg+xml;charset=utf-8,' +
									encodeURIComponent(await blob.text());
							})
							.catch((error: unknown) => {
								throw error;
							});
						return;
					}

					let next = value;
					const prefix = 'data:image/svg+xml;charset=utf-8,';
					if (value.startsWith(prefix)) {
						const markup = decodeURIComponent(value.slice(prefix.length));
						if (markup.startsWith('<svg')) {
							if (mode.rasterScale !== null) {
								const document = new DOMParser().parseFromString(
									markup,
									'image/svg+xml',
								);
								const svg = document.documentElement;
								if (mode.rasterScale !== null) {
									const width = parseFloat(svg.getAttribute('width')!);
									const height = parseFloat(svg.getAttribute('height')!);
									svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
									svg.setAttribute('width', String(width * mode.rasterScale));
									svg.setAttribute('height', String(height * mode.rasterScale));
									svg.setAttribute(
										'style',
										(svg.getAttribute('style') ?? '') +
											`;width:${width * mode.rasterScale}px!important;height:${height * mode.rasterScale}px!important;`,
									);
								}

								next =
									prefix +
									encodeURIComponent(
										new XMLSerializer().serializeToString(svg),
									);
							}

							captured.push(decodeURIComponent(next.slice(prefix.length)));
						}
					}

					if (mode.logicalSize && next.startsWith('data:image/svg+xml')) {
						this.width = 160;
						this.height = 50;
					}

					if (next.startsWith('data:image/svg+xml'))
						this.addEventListener(
							'load',
							() => {
								imageSizes.push({
									width: this.width,
									height: this.height,
									naturalWidth: this.naturalWidth,
									naturalHeight: this.naturalHeight,
								});
							},
							{once: true},
						);
					if (bitmapMode) {
						const originalLoad = this.onload;
						this.onload = async (event) => {
							try {
								const bitmap = await createImageBitmap(this);
								if (disposed) {
									bitmap.close();
									return;
								}

								bitmaps.set(this, bitmap);
								createdBitmaps.push(bitmap);
								bitmapSizes.push({width: bitmap.width, height: bitmap.height});
								originalLoad?.call(this, event);
							} catch (error) {
								if (disposed) return;
								bitmapErrors.push(String(error));
								this.onerror?.(new Event('error'));
							}
						};
					}

					descriptor.set!.call(this, next);
				},
			});
			const still = await renderStillOnWeb({
				composition: mode.readback
					? {...svgViewportMedia, component: ReadbackComponent}
					: svgViewportMedia,
				frame: 0,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				scale: 1.25,
			});
			actual = await still.blob({format: 'png'});
		} catch (error) {
			let binary = '';
			for (const byte of new Uint8Array(await reference.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				directory + '/reference.b64',
				btoa(binary),
			);
			await server.commands.writeFile(
				directory + '/failure.json',
				JSON.stringify({
					...mode,
					error: String(error),
					bitmapErrors,
					bitmapSizes,
					captured,
					imageSizes,
					userAgent: navigator.userAgent,
					dpr: devicePixelRatio,
				}),
			);
			throw error;
		} finally {
			disposed = true;
			for (const bitmap of createdBitmaps) bitmap.close();
			Object.defineProperty(
				OffscreenCanvasRenderingContext2D.prototype,
				'drawImage',
				drawDescriptor,
			);
			Object.defineProperty(HTMLImageElement.prototype, 'src', descriptor);
			Object.defineProperty(
				OffscreenCanvas.prototype,
				'getContext',
				contextDescriptor,
			);
		}

		if (mode.id === 'whole-frame-svg' || mode.id === 'padded-svg-nodes') {
			try {
				let controlBinary = '';
				for (const byte of new Uint8Array(await actual.arrayBuffer()))
					controlBinary += String.fromCharCode(byte);
				await server.commands.writeFile(
					directory + '/control-actual.b64',
					btoa(controlBinary),
				);
				const roots = captured.map((markup) => {
					const svg = new DOMParser().parseFromString(
						markup,
						'image/svg+xml',
					).documentElement;
					const authored = document.createElement('div');
					authored.setAttribute(
						'style',
						svg.getAttribute('data-remotion-authored-style')!,
					);
					const x = parseFloat(authored.style.left);
					const y = parseFloat(authored.style.top);
					if (!Number.isFinite(x) || !Number.isFinite(y))
						throw new Error('Expected measured absolute SVG position');
					svg.setAttribute('x', String(x));
					svg.setAttribute('y', String(y));
					return svg;
				});
				const groups =
					mode.id === 'whole-frame-svg' ? [roots] : roots.map((svg) => [svg]);
				const canvas = new OffscreenCanvas(500, 200);
				try {
					const context = canvas.getContext('2d')!;
					context.fillStyle = 'white';
					context.fillRect(0, 0, 500, 200);
					for (const rootsInGroup of groups) {
						const xml = document.implementation.createDocument(
							'http://www.w3.org/2000/svg',
							'svg',
							null,
						);
						const root = xml.documentElement;
						root.setAttribute('width', '500');
						root.setAttribute('height', '200');
						const group = xml.createElementNS(
							'http://www.w3.org/2000/svg',
							'g',
						);
						group.setAttribute('transform', 'scale(1.25)');
						for (const svg of rootsInGroup)
							group.appendChild(xml.importNode(svg, true));
						root.appendChild(group);
						const markup = new XMLSerializer().serializeToString(root);
						assembled.push(markup);
						const image = await new Promise<HTMLImageElement>(
							(resolve, reject) => {
								const loaded = new Image();
								loaded.onload = () => resolve(loaded);
								loaded.onerror = () =>
									reject(new Error('Assembled SVG decode failed'));
								loaded.src =
									'data:image/svg+xml;charset=utf-8,' +
									encodeURIComponent(markup);
							},
						);
						context.drawImage(image, 0, 0);
					}

					actual = await canvas.convertToBlob({type: 'image/png'});
				} finally {
					canvas.width = 0;
					canvas.height = 0;
				}
			} catch (error) {
				let binary = '';
				for (const byte of new Uint8Array(await reference.arrayBuffer()))
					binary += String.fromCharCode(byte);
				await server.commands.writeFile(
					directory + '/reference.b64',
					btoa(binary),
				);
				await server.commands.writeFile(
					directory + '/failure.json',
					JSON.stringify({
						...mode,
						error: String(error),
						assembled,
						captured,
						imageSizes,
						bitmapErrors,
						bitmapSizes,
						userAgent: navigator.userAgent,
						dpr: devicePixelRatio,
					}),
				);
				throw error;
			}
		}

		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				directory + '/' + name + '.b64',
				btoa(binary),
			);
		}

		const comparison = await compareNativePixels(reference, actual);
		await server.commands.writeFile(
			directory + '/metadata.json',
			JSON.stringify({
				...mode,
				...comparison,
				captured,
				imageSizes,
				bitmapSizes,
				bitmapErrors,
				assembled,
				userAgent: navigator.userAgent,
				dpr: devicePixelRatio,
			}),
		);
		expect(captured).toHaveLength(
			mode.id === 'unchanged' ||
				mode.id === 'software-canvas' ||
				mode.id === 'flatten-svg-transform' ||
				mode.id === 'bitmap-native'
				? 2
				: 4,
		);
		expect(comparison.mismatchedPixels).toBe(0);
	});
}
