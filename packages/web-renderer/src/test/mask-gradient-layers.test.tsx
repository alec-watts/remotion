import {expect, test, vi} from 'vitest';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {maskCopyOverflow} from './fixtures/mask-copy-overflow';
import {
	maskGradientLayersUrl,
	maskGradientLayersBlob,
	maskGradientPaletteTransparent,
	maskGradientLayersTokenUrlTransparent,
} from './fixtures/mask-gradient-layers';
import {testCompositions} from './utils';

test('copies scaled overflow mask layers in device coordinates', async () => {
	const canvas = new OffscreenCanvas(1, 1);
	const prototype = Object.getPrototypeOf(
		canvas.getContext('2d')!,
	) as OffscreenCanvasRenderingContext2D;
	canvas.width = 0;
	const {drawImage} = prototype;
	const transforms: DOMMatrix[] = [];
	const spy = vi.spyOn(prototype, 'drawImage').mockImplementation(function (
		this: OffscreenCanvasRenderingContext2D,
		...args: unknown[]
	) {
		if (this.globalCompositeOperation === 'copy')
			transforms.push(this.getTransform());
		Reflect.apply(drawImage, this, args);
	});
	try {
		await renderStillOnWeb({
			licenseKey: 'free-license',
			composition: maskCopyOverflow({overflow: 'hidden', mode: 'hard'}),
			frame: 0,
			inputProps: {},
			scale: 2,
			allowHtmlInCanvas: false,
		});
	} finally {
		spy.mockRestore();
	}

	expect(transforms.length).toBeGreaterThan(0);
	for (const transform of transforms) expect(transform.isIdentity).toBe(true);
});

test('composes gradient mask operators across raster sources and alpha', async () => {
	await testCompositions({
		cases: [
			maskGradientLayersUrl,
			maskGradientLayersBlob,
			maskGradientPaletteTransparent,
			maskGradientLayersTokenUrlTransparent,
		].map((composition) => ({composition, frame: 1})),
		columns: 2,
		testId: 'mask-gradient-layers',
		scale: null,
	});
});
