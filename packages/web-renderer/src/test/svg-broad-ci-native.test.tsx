import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import * as svgDrawable from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {issue10676SvgGradientStroke} from './fixtures/issue-10676-svg-gradient-stroke';
import {manyLayers} from './fixtures/many-layers';
import {
	pr11215FontPromise,
	pr11215SvgFontRepro,
} from './fixtures/pr-11215-svg-font-repro';
import {textFixture} from './fixtures/text/text';
import {captureNativeReference, compareNativePixels} from './native-reference';

for (const {scene, frame} of [
	{scene: manyLayers, frame: 0},
	{scene: pr11215SvgFontRepro, frame: 0},
	{scene: textFixture, frame: 0},
	{scene: issue10676SvgGradientStroke, frame: 80},
]) {
	test('measures native broad CI SVG control ' + scene.id, async () => {
		await pr11215FontPromise;
		const reference = await captureNativeReference(scene, frame, {
			omitBackground: false,
		});
		const descriptor = Object.getOwnPropertyDescriptor(
			HTMLImageElement.prototype,
			'src',
		);
		if (!descriptor?.set || !descriptor.get)
			throw new Error('Image src property unavailable');
		const images: unknown[] = [];
		let actual: Blob;
		try {
			Object.defineProperty(HTMLImageElement.prototype, 'src', {
				...descriptor,
				get(this: HTMLImageElement) {
					return descriptor.get!.call(this);
				},
				set(this: HTMLImageElement, value: string) {
					this.addEventListener(
						'load',
						() => {
							const metadata = svgDrawable.svgDrawableMetadata?.get(this);
							if (metadata)
								images.push({width: this.width, height: this.height, metadata});
						},
						{once: true},
					);
					descriptor.set!.call(this, value);
				},
			});
			const still = await renderStillOnWeb({
				composition: scene,
				frame,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
			});
			actual = await still.blob({format: 'png'});
		} finally {
			Object.defineProperty(HTMLImageElement.prototype, 'src', descriptor);
		}

		const comparison = await compareNativePixels(reference, actual);
		const directory = `test/__results__/svg-authored-order-url/${server.browser}/broad-${scene.id}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(`${directory}/${name}.b64`, btoa(binary));
		}

		await server.commands.writeFile(
			`${directory}/metadata.json`,
			JSON.stringify({
				id: scene.id,
				frame,
				...comparison,
				images,
				userAgent: navigator.userAgent,
			}),
		);
		expect(comparison.mismatchedPixels).toBe(0);
	});
}
