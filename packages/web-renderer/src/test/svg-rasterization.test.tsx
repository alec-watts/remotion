import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {svgExplicitDimensions} from './fixtures/svg-explicit-dimensions';
import {svgRasterizationScenes} from './fixtures/svg-rasterization';
import {captureNativeReference, compareNativePixels} from './native-reference';

test('preserves the native aspect ratio of an authored SVG viewport after flex shrinking', async () => {
	const reference = await captureNativeReference(svgExplicitDimensions, 0, {
		omitBackground: false,
	});
	const still = await renderStillOnWeb({
		composition: svgExplicitDimensions,
		frame: 0,
		inputProps: {},
		licenseKey: 'free-license',
		allowHtmlInCanvas: false,
	});
	const actual = await still.blob({format: 'png'});
	const directory = `test/__results__/svg-authored-order-url/${server.browser}/rasterization-svg-explicit-dimensions`;
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
			id: 'svg-explicit-dimensions',
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
