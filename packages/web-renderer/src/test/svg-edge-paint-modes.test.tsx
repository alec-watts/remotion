import {useLayoutEffect, useRef} from 'react';
import {beforeAll, expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgViewportMedia} from './fixtures/svg-viewport-media';
import {captureNativeReference, compareNativePixels} from './native-reference';

const paintModes = [
	{id: 'unchanged', css: '', target: 'child'},
	{id: 'text-readback', css: '', target: 'child'},
	{id: 'round-trip', css: '', target: 'child'},
	{id: 'translate3d', css: 'transform:translate3d(0,0,0)', target: 'child'},
	{id: 'translate2d', css: 'transform:translate(0,0)', target: 'child'},
	{id: 'will-change', css: 'will-change:transform', target: 'child'},
	{id: 'filter-opacity', css: 'filter:opacity(1)', target: 'child'},
	{id: 'filter-brightness', css: 'filter:brightness(1)', target: 'child'},
	{id: 'overflow-hidden', css: 'overflow:hidden', target: 'child'},
	{id: 'overflow-clip', css: 'overflow:clip', target: 'child'},
	{
		id: 'clip-inset',
		css: 'border-radius:0!important;clip-path:inset(0 round 10%)',
		target: 'child',
	},
	{
		id: 'clip-inset-round',
		css: 'clip-path:inset(0 round 10%)',
		target: 'child',
	},
	{id: 'will-opacity', css: 'will-change:opacity', target: 'child'},
	{id: 'isolation', css: 'isolation:isolate', target: 'child'},
	{id: 'backface', css: 'backface-visibility:hidden', target: 'child'},
	{id: 'contain-paint', css: 'contain:paint', target: 'child'},
	{id: 'near-opacity', css: 'opacity:0.999999999', target: 'child'},
	{id: 'pixelated', css: 'image-rendering:pixelated', target: 'child'},
	{
		id: 'shape-precision',
		css: 'shape-rendering:geometricPrecision',
		target: 'child',
	},
	{
		id: 'root-shape-precision',
		css: 'shape-rendering:geometricPrecision',
		target: 'root',
	},
	{id: 'fo-translate3d', css: 'transform:translate3d(0,0,0)', target: 'fo'},
	{id: 'root-opacity', css: 'filter:opacity(1)', target: 'root'},
] as const;
const modes = [
	...paintModes.map((mode) => ({...mode, rasterScale: null as number | null})),
	...[1.25, 1.5, 2, 3, 4, 8].map((rasterScale) => ({
		id: 'raster-' + rasterScale,
		css: '',
		target: 'root' as const,
		rasterScale,
	})),
];
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
	reference = await captureNativeReference(svgViewportMedia, 0, {
		omitBackground: false,
	});
});

test.for(modes)('SVG edge painting %o', async (mode) => {
	const descriptor = Object.getOwnPropertyDescriptor(
		HTMLImageElement.prototype,
		'src',
	);
	if (!descriptor?.set || !descriptor.get)
		throw new Error('Image src setter unavailable');
	const captured: string[] = [];
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
					if (
						markup.includes('physical-radius') ||
						markup.includes('explicit-radius')
					) {
						if (mode.id !== 'unchanged') {
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

							const targets =
								mode.target === 'root'
									? [svg]
									: Array.from(
											svg.querySelectorAll(
												mode.target === 'fo'
													? 'foreignObject'
													: '.physical-radius, .explicit-radius',
											),
										);
							if (mode.css)
								for (const target of targets)
									target.setAttribute(
										'style',
										(target.getAttribute('style') ?? '') + ';' + mode.css + ';',
									);
							next =
								prefix +
								encodeURIComponent(new XMLSerializer().serializeToString(svg));
						}

						captured.push(decodeURIComponent(next.slice(prefix.length)));
					}
				}

				descriptor.set!.call(this, next);
			},
		});
		const still = await renderStillOnWeb({
			composition:
				mode.id === 'text-readback'
					? {...svgViewportMedia, component: ReadbackComponent}
					: svgViewportMedia,
			frame: 0,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
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
			userAgent: navigator.userAgent,
			dpr: devicePixelRatio,
		}),
	);
	expect(captured).toHaveLength(2);
	expect(comparison.mismatchedPixels).toBe(0);
});
