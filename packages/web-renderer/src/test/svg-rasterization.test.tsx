import {expect, test} from 'vitest';
import {drawDomElement} from '../drawing/draw-dom-element';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {
	pr11215FontPromise,
	svgOpaqueFont,
} from './fixtures/pr-11215-svg-font-repro';
import {svgExplicitDimensionsNative} from './fixtures/svg-explicit-dimensions';
import {svgRasterizationScenes} from './fixtures/svg-rasterization';
import {captureNativeReference, compareNativePixels} from './native-reference';

for (const integerPosition of [false, true])
	test.for(['opaque', 'transparent', 'filtered'] as const)(
		'preserves existing canvas pixels when reusing an SVG over %s backdrops at ' +
			(integerPosition ? 'integer' : 'scaled') +
			' positions',
		async (mode) => {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('width', '80');
			svg.setAttribute('height', '40');
			svg.style.cssText = 'position:absolute;width:80px;height:40px';
			svg.innerHTML =
				'<circle cx="24" cy="20" r="12" fill="white" /><text x="44" y="24" font-size="20">g</text>';
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
					context.scale(integerPosition ? 1 : 1.25, integerPosition ? 1 : 1.25);
					context.filter = mode === 'filtered' ? 'blur(3px)' : 'none';
					await draw({
						contextToDraw: context,
						dimensions: new DOMRect(0, 0, 80, 40),
						computedStyle: getComputedStyle(svg),
					});
					expect(
						Array.from(context.getImageData(point[0]!, point[1]!, 1, 1).data),
					).toEqual(before);
					if (mode !== 'filtered') {
						expect(Array.from(context.getImageData(30, 25, 1, 1).data)).toEqual(
							[255, 255, 255, 255],
						);
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
			const still = await renderStillOnWeb({
				composition: scene,
				frame: 0,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				scale: 1.25,
			});
			const actual = await still.blob({format: 'png'});
			expect(
				(await compareNativePixels(reference, actual)).mismatchedPixels,
			).toBe(0);
		},
	);
}

for (const frame of [0, 1]) {
	test(
		'preserves native integer-position SVG glyphs over opaque background at frame ' +
			frame,
		async () => {
			await pr11215FontPromise;
			const reference = await captureNativeReference(svgOpaqueFont, frame, {
				omitBackground: false,
			});
			const still = await renderStillOnWeb({
				composition: svgOpaqueFont,
				frame,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
			});
			const actual = await still.blob({format: 'png'});
			expect(
				(await compareNativePixels(reference, actual)).mismatchedPixels,
			).toBe(0);
		},
	);
}
