import {createElement} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {expect, test, vi} from 'vitest';
import {page} from 'vitest/browser';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgExternalFontReady} from './fixtures/svg-external-font-selection';
import '../symbol-dispose';
import {svgTitledPersistentOrder} from './fixtures/svg-persistent-font-order';
import {
	svgTitledFontMediaCache,
	svgTitledFontCarrier,
	svgTitledFontModes,
	svgTitledFontSources,
} from './fixtures/svg-titled-font-carrier';
import {captureNativeReference, compareNativePixels} from './native-reference';
import {testCompositions} from './utils';

test('preserves titled stylesheet font carriers', async () => {
	await testCompositions({
		cases: svgTitledFontModes.flatMap((mode) =>
			svgTitledFontSources.map((source) => ({
				composition: svgTitledFontCarrier(mode, source, false, false),
				frame: 1,
			})),
		),
		columns: 3,
		testId: 'svg-titled-font-carriers',
		scale: null,
	});
});

test('invalidates titled font carrier cache when viewport media changes', async () => {
	await svgExternalFontReady;
	const viewport = {width: innerWidth, height: innerHeight};
	const host = document.createElement('div');
	Object.assign(host.style, {position: 'fixed', left: '-1000px', top: '0px'});
	document.body.appendChild(host);
	const root = createRoot(host);
	const composition = svgTitledFontMediaCache({active: null});
	flushSync(() => root.render(createElement(composition.component)));
	const svg = host.querySelector('svg')!;
	const source = new XMLSerializer().serializeToString(svg);
	const draw = async (element: SVGSVGElement) => {
		const canvas = new OffscreenCanvas(100, 60);
		try {
			canvas
				.getContext('2d')!
				.drawImage(await turnSvgIntoDrawable(element), 0, 0);
			return await canvas.convertToBlob({type: 'image/png'});
		} finally {
			canvas.width = 0;
			canvas.height = 0;
		}
	};

	try {
		for (const width of [800, 400, 800]) {
			await page.viewport(width, 720);
			const active = matchMedia('(min-width: 500px)').matches;
			expect(active).toBe(width >= 500);
			expect(new XMLSerializer().serializeToString(svg)).toBe(source);
			const actual = await draw(svg);
			const fresh = svg.cloneNode(true) as SVGSVGElement;
			host.appendChild(fresh);
			let expected: Blob;
			try {
				expected = await draw(fresh);
			} finally {
				fresh.remove();
			}

			const native = await captureNativeReference(composition, 0, {
				omitBackground: false,
			});
			const literal = await captureNativeReference(
				svgTitledFontMediaCache({active}),
				0,
				{omitBackground: false},
			);
			expect(
				(await compareNativePixels(native, literal)).mismatchedPixels,
			).toBe(0);
			expect(
				(await compareNativePixels(expected, actual)).mismatchedPixels,
			).toBe(0);
			expect((await compareNativePixels(native, actual)).mismatchedPixels).toBe(
				0,
			);
		}
	} finally {
		root.unmount();
		host.remove();
		await page.viewport(viewport.width, viewport.height);
	}
});

test('replays final font order in DOM-empty CSSOM carriers', async () => {
	for (const firstRoboto of [false, true]) {
		const svgBlobs: Blob[] = [];
		const createObjectURL = URL.createObjectURL.bind(URL);
		const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
			if (value instanceof Blob && value.type.startsWith('image/svg+xml'))
				svgBlobs.push(value);
			return createObjectURL(value);
		});
		let actual: Blob;
		try {
			actual = await (
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition: svgTitledPersistentOrder(
						'cssom-last',
						firstRoboto,
						false,
					),
					frame: 0,
					inputProps: {},
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
		} finally {
			spy.mockRestore();
		}

		expect(svgBlobs).toHaveLength(1);
		const svg = new DOMParser().parseFromString(
			await svgBlobs[0].text(),
			'image/svg+xml',
		);
		const styles = Array.from(svg.querySelectorAll('style'));
		expect(styles).toHaveLength(2);
		const urls = styles.map((style) =>
			Array.from(
				style.textContent!.matchAll(/url\(["']?([^"')]+)["']?\)/g),
				(match) => match[1],
			),
		);
		expect(new Set(urls[0]).size).toBe(2);
		expect(new Set(urls[1]).size).toBe(2);
		expect(urls[1].at(-1)).toBe(urls[0].at(-1));
		const literal = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition: svgTitledPersistentOrder('cssom-last', firstRoboto, true),
				frame: 0,
				inputProps: {},
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		expect((await compareNativePixels(literal, actual)).mismatchedPixels).toBe(
			0,
		);
	}
});
