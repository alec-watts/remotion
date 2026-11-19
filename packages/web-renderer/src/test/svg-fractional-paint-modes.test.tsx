import {useLayoutEffect, useRef} from 'react';
import {beforeAll, expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgViewportMedia} from './fixtures/svg-viewport-media';
import {captureNativeReference, compareNativePixels} from './native-reference';

const modes = [
	{id: 'unchanged', rasterScale: null, logicalSize: false, readback: false},
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

test.for(modes)('SVG edge painting %o', async (mode) => {
	const descriptor = Object.getOwnPropertyDescriptor(
		HTMLImageElement.prototype,
		'src',
	);
	if (!descriptor?.set || !descriptor.get)
		throw new Error('Image src setter unavailable');
	const captured: string[] = [];
	const imageSizes: {
		width: number;
		height: number;
		naturalWidth: number;
		naturalHeight: number;
	}[] = [];
	let actual: Blob;
	try {
		Object.defineProperty(HTMLImageElement.prototype, 'src', {
			...descriptor,
			get(this: HTMLImageElement) {
				return descriptor.get!.call(this);
			},
			set(this: HTMLImageElement, value: string) {
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
								encodeURIComponent(new XMLSerializer().serializeToString(svg));
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
	} finally {
		Object.defineProperty(HTMLImageElement.prototype, 'src', descriptor);
	}

	const directory = `test/__results__/svg-edge-paint/${server.browser}/${mode.id}`;
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
			userAgent: navigator.userAgent,
			dpr: devicePixelRatio,
		}),
	);
	expect(captured).toHaveLength(4);
	expect(comparison.mismatchedPixels).toBe(0);
});
