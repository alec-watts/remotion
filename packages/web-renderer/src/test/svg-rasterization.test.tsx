import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {drawDomElement} from '../drawing/draw-dom-element';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {svgExplicitDimensionsNative} from './fixtures/svg-explicit-dimensions';
import {svgRasterizationScenes} from './fixtures/svg-rasterization';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for(['opaque', 'transparent', 'filtered'] as const)(
	'preserves existing canvas pixels when reusing an SVG over %s backdrops',
	async (mode) => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '80');
		svg.setAttribute('height', '40');
		svg.style.cssText = 'position:absolute;width:80px;height:40px';
		svg.innerHTML = '<circle cx="24" cy="20" r="12" fill="white" />';
		document.body.appendChild(svg);
		try {
			const mounted = svg.outerHTML;
			const drawable = turnSvgIntoDrawable(svg);
			const draw = drawDomElement(svg);
			const canvas = new OffscreenCanvas(100, 50);
			const context = canvas.getContext('2d')!;
			const point = mode === 'filtered' ? [50, 48] : [96, 48];
			for (const color of ['red', 'blue']) {
				context.reset();
				context.globalAlpha = mode === 'transparent' ? 0.5 : 1;
				context.fillStyle = color;
				context.fillRect(0, 0, 100, 50);
				if (mode === 'filtered') {
					context.fillStyle = '#123355';
					context.fillRect(50, 0, 50, 50);
				}

				context.globalAlpha = 1;
				const before = Array.from(
					context.getImageData(point[0]!, point[1]!, 1, 1).data,
				);
				context.scale(1.25, 1.25);
				context.filter = mode === 'filtered' ? 'blur(3px)' : 'none';
				await draw({
					contextToDraw: context,
					dimensions: new DOMRect(0, 0, 80, 40),
					computedStyle: getComputedStyle(svg),
				});

				await server.commands.writeFile(
					`test/__results__/svg-authored-order-url/${server.browser}/backdrop-cache-${mode}-${color}.json`,
					JSON.stringify({
						mode,
						color,
						before,
						after: Array.from(
							context.getImageData(point[0]!, point[1]!, 1, 1).data,
						),
						sourceUnchanged: svg.outerHTML === mounted,
						drawableReused: turnSvgIntoDrawable(svg) === drawable,
					}),
				);
				expect(
					Array.from(context.getImageData(point[0]!, point[1]!, 1, 1).data),
				).toEqual(before);
				if (mode !== 'filtered') {
					expect(Array.from(context.getImageData(30, 25, 1, 1).data)).toEqual([
						255, 255, 255, 255,
					]);
				}

				expect(turnSvgIntoDrawable(svg)).toBe(drawable);
				expect(svg.outerHTML).toBe(mounted);
			}
		} finally {
			svg.remove();
		}
	},
);

test('preserves the native aspect ratio of an authored SVG viewport after flex shrinking', async () => {
	const reference = await captureNativeReference(
		svgExplicitDimensionsNative,
		0,
		{
			omitBackground: false,
		},
	);
	const still = await renderStillOnWeb({
		composition: svgExplicitDimensionsNative,
		frame: 0,
		inputProps: {},
		licenseKey: 'free-license',
		allowHtmlInCanvas: false,
	});
	const actual = await still.blob({format: 'png'});
	const directory = `test/__results__/svg-authored-order-url/${server.browser}/rasterization-svg-explicit-dimensions-native`;
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

	await server.commands.writeFile(
		directory + '/metadata.json',
		JSON.stringify({
			id: svgExplicitDimensionsNative.id,
			...(await compareNativePixels(reference, actual)),
			userAgent: navigator.userAgent,
		}),
	);

	expect((await compareNativePixels(reference, actual)).mismatchedPixels).toBe(
		0,
	);
});

for (const scene of svgRasterizationScenes) {
	test(
		'preserves native fractional SVG rasterization in ' + scene.id,
		async () => {
			const Component = scene.component;
			const reference = await captureNativeReference(
				{
					...scene,
					id: scene.id + '-fractional',
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
							<Component />
						</div>
					),
				},
				0,
				{omitBackground: false},
			);
			const descriptor = Object.getOwnPropertyDescriptor(
				HTMLImageElement.prototype,
				'src',
			);
			if (!descriptor?.set || !descriptor.get)
				throw new Error('Image src property unavailable');
			const loadedSvgs: string[] = [];
			let actual: Blob;
			try {
				Object.defineProperty(HTMLImageElement.prototype, 'src', {
					...descriptor,
					get(this: HTMLImageElement) {
						return descriptor.get!.call(this);
					},
					set(this: HTMLImageElement, value: string) {
						const prefix = 'data:image/svg+xml;charset=utf-8,';
						if (value.startsWith(prefix))
							loadedSvgs.push(decodeURIComponent(value.slice(prefix.length)));
						descriptor.set!.call(this, value);
					},
				});
				const still = await renderStillOnWeb({
					composition: scene,
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

			const comparison = await compareNativePixels(reference, actual);
			const directory = `test/__results__/svg-authored-order-url/${server.browser}/rasterization-${scene.id}`;
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

			await server.commands.writeFile(
				directory + '/metadata.json',
				JSON.stringify({
					id: scene.id,
					...comparison,
					loadedSvgs,
					userAgent: navigator.userAgent,
				}),
			);
			expect(comparison.mismatchedPixels).toBe(0);
		},
	);
}
