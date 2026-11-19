import {useLayoutEffect, useRef} from 'react';
import {beforeAll, expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {rewriteSvgStyleHeaders} from '../drawing/has-excluded-svg-style-at-rule';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgViewportMedia} from './fixtures/svg-viewport-media';
import {captureNativeReference, compareNativePixels} from './native-reference';

const modes = [
	...[
		'self-scoped-padded-svg-nodes',
		'root-control',
		'root-scoped-padded-svg-nodes',
		'root-self-scoped-padded-svg-nodes',
	].map((id) => ({id, rasterScale: null, logicalSize: false, readback: false})),
	...[
		'scoped-padded-svg-nodes',
		'scope-control',
		'scope-padded-svg-nodes',
		'scope-scoped-padded-svg-nodes',
	].map((id) => ({id, rasterScale: null, logicalSize: false, readback: false})),
	{
		id: 'image-frame-svg',
		rasterScale: null,
		logicalSize: false,
		readback: false,
	},
	{
		id: 'image-padded-svg-nodes',
		rasterScale: null,
		logicalSize: false,
		readback: false,
	},
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
const scopeStylesIncludingRoot = (text: string) => {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(text);
	const namespaces = Array.from(sheet.cssRules)
		.filter((rule) => rule.type === CSSRule.NAMESPACE_RULE)
		.map((rule) => rule.cssText)
		.join('');
	const headerSheet = new CSSStyleSheet();
	const rewritten = rewriteSvgStyleHeaders(text, (header) => {
		headerSheet.replaceSync(namespaces + header + '{}');
		const rule = Array.from(headerSheet.cssRules).at(-1);
		if (!(rule instanceof CSSStyleRule)) return header;
		const selectors: string[] = [];
		let start = 0;
		let depth = 0;
		let quote: string | null = null;
		let escaped = false;
		const selector = rule.selectorText.replace(
			/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\\[\s\S]|:root(?![\w-])/gi,
			(match) => (match.toLowerCase() === ':root' ? ':scope' : match),
		);
		for (let i = 0; i < selector.length; i++) {
			const char = selector[i]!;
			if (escaped) {
				escaped = false;
				continue;
			}

			if (char === '\\') {
				escaped = true;
				continue;
			}

			if (quote) {
				if (char === quote) quote = null;
				continue;
			}

			if (char === '"' || char === "'") {
				quote = char;
				continue;
			}

			if (char === '(' || char === '[') depth++;
			if (char === ')' || char === ']') depth--;
			if (char === ',' && depth === 0) {
				selectors.push(selector.slice(start, i).trim());
				start = i + 1;
			}
		}

		selectors.push(selector.slice(start).trim());
		return selectors
			.flatMap((item) => [item, `:where(:scope):is(${item})`])
			.join(',');
	});
	return (
		namespaces + '@scope ([data-remotion-raster-root]) {' + rewritten + '}'
	);
};

const MediaComponent = svgViewportMedia.component;
const ScopeComponent = () => (
	<div
		style={{position: 'absolute', width: 400, height: 160, background: 'white'}}
	>
		{[8, 208].map((left, index) => (
			<svg
				key={left}
				width={320}
				height={100}
				style={{position: 'absolute', left, top: 88, width: 160, height: 50}}
			>
				<style>{`@media (min-width:1px) { .scope-marker {fill:lime;} ${index === 0 ? 'g > svg .scope-marker, svg svg .scope-marker' : ':is(g svg, .absent) > .scope-marker, g:has(> svg) .scope-marker'} {fill:red;} }`}</style>
				<rect className="scope-marker" width={160} height={50} />
			</svg>
		))}
	</div>
);
const RootComponent = () => (
	<div
		style={{position: 'absolute', width: 400, height: 160, background: 'white'}}
	>
		<svg
			className="root-painted"
			data-info="a,b:root"
			width={320}
			height={100}
			style={{position: 'absolute', left: 8, top: 88, width: 160, height: 50}}
		>
			<style>{`@namespace s url(http://www.w3.org/2000/svg); @media (min-width:1px) {
 :root {stroke-linejoin:round;}
 :is(s|svg.root-painted[data-info="a,b:root"], .absent), #absent {stroke:red;stroke-width:4px;}
 s|svg.root-painted[data-info="a,b:root"] {stroke:blue;}
 .root-marker {fill:lime;}
 }`}</style>
			<rect className="root-marker" x={8} y={8} width={144} height={34} />
		</svg>
	</div>
);
let rootReference: Blob;
let scopeReference: Blob;
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
	scopeReference = await captureNativeReference(
		{
			...svgViewportMedia,
			id: 'svg-rasterization-scope-fractional',
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
					<ScopeComponent />
				</div>
			),
		},
		0,
		{omitBackground: false},
	);
	rootReference = await captureNativeReference(
		{
			...svgViewportMedia,
			id: 'svg-rasterization-root-fractional',
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
					<RootComponent />
				</div>
			),
		},
		0,
		{omitBackground: false},
	);
});

for (const mode of modes) {
	test('SVG fractional painting ' + mode.id, async () => {
		const isScopeScene = mode.id.startsWith('scope-');
		const isRootScene = mode.id.startsWith('root-');
		const includeRoot =
			mode.id === 'self-scoped-padded-svg-nodes' ||
			mode.id === 'root-self-scoped-padded-svg-nodes';
		const nativeReference = isRootScene
			? rootReference
			: isScopeScene
				? scopeReference
				: reference;
		const composition = isRootScene
			? {
					...svgViewportMedia,
					id: 'svg-rasterization-root',
					component: RootComponent,
				}
			: isScopeScene
				? {
						...svgViewportMedia,
						id: 'svg-rasterization-scope',
						component: ScopeComponent,
					}
				: svgViewportMedia;
		const scopedStyles =
			mode.id === 'scoped-padded-svg-nodes' ||
			mode.id === 'scope-scoped-padded-svg-nodes' ||
			mode.id === 'root-scoped-padded-svg-nodes' ||
			includeRoot;
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
					? {...composition, component: ReadbackComponent}
					: composition,
				frame: 0,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				scale: 1.25,
			});
			actual = await still.blob({format: 'png'});
		} catch (error) {
			let binary = '';
			for (const byte of new Uint8Array(await nativeReference.arrayBuffer()))
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

		if (
			mode.id === 'whole-frame-svg' ||
			mode.id === 'padded-svg-nodes' ||
			mode.id === 'image-frame-svg' ||
			mode.id === 'image-padded-svg-nodes' ||
			scopedStyles ||
			mode.id === 'scope-padded-svg-nodes'
		) {
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
					if (mode.id.startsWith('image-')) {
						const image = svg.ownerDocument.createElementNS(
							'http://www.w3.org/2000/svg',
							'image',
						);
						image.setAttribute('x', String(x));
						image.setAttribute('y', String(y));
						image.setAttribute('width', '160');
						image.setAttribute('height', '50');
						image.setAttribute(
							'href',
							'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup),
						);
						return image;
					}

					if (scopedStyles) {
						svg.setAttribute('data-remotion-raster-root', '');
						for (const style of svg.querySelectorAll('style')) {
							const type = style.getAttribute('type')?.trim().toLowerCase();
							if (type && type !== 'text/css') continue;
							style.textContent = includeRoot
								? scopeStylesIncludingRoot(style.textContent ?? '')
								: '@scope ([data-remotion-raster-root]) {' +
									(style.textContent ?? '') +
									'}';
						}
					}

					svg.setAttribute('x', String(x));
					svg.setAttribute('y', String(y));
					return svg;
				});
				const groups = mode.id.endsWith('frame-svg')
					? [roots]
					: roots.map((svg) => [svg]);
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
				for (const byte of new Uint8Array(await nativeReference.arrayBuffer()))
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
			['reference', nativeReference],
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

		const comparison = await compareNativePixels(nativeReference, actual);
		await server.commands.writeFile(
			directory + '/metadata.json',
			JSON.stringify({
				...mode,
				isScopeScene,
				isRootScene,
				includeRoot,
				scopedStyles,
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
			isRootScene
				? 1
				: isScopeScene ||
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
