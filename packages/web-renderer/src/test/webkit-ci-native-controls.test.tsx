import {expect, test} from 'vitest';
import {page, server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {createPixelatedBackgroundSamplerLifetime} from './fixtures/background-image-pixelated-sampler-lifetime';
import {pixelatedRaster} from './fixtures/background-image-url-pixelated';
import {issue7050Repro} from './fixtures/issue-7050-repro';
import {maskImageUrl} from './fixtures/mask-image-url';
import {maskImageUrlSizing} from './fixtures/mask-image-url-sizing';
import {backgroundClipText} from './fixtures/text/background-clip-text';
import {textShadow} from './fixtures/text/text-shadow';
import {webkitTextStroke} from './fixtures/text/webkit-text-stroke';
import {captureNativeReference, countNativePixels} from './native-reference';

const cases = [
	{id: 'background-clip', composition: backgroundClipText, scale: 1},
	{id: 'background-clip-2', composition: backgroundClipText, scale: 2},
	{id: 'issue-7050-2', composition: issue7050Repro, scale: 2},
	{id: 'text-shadow', composition: textShadow, scale: 1},
	{id: 'text-stroke', composition: webkitTextStroke, scale: 1},
	{id: 'mask-url', composition: maskImageUrl, scale: 1},
	{id: 'mask-url-2', composition: maskImageUrl, scale: 2},
	{id: 'mask-sizing-2', composition: maskImageUrlSizing, scale: 2},
	{
		id: 'sampler-control',
		composition: createPixelatedBackgroundSamplerLifetime(false),
		scale: 1,
	},
	{
		id: 'sampler-pixelated',
		composition: createPixelatedBackgroundSamplerLifetime(true),
		scale: 1,
	},
];

test.skipIf(server.browser !== 'webkit').for(cases)(
	'compares native WebKit CI regression in $id',
	async ({id, composition, scale}) => {
		await page.viewport(
			Math.max(1280, composition.width * scale),
			Math.max(720, composition.height * scale),
		);
		const Scene = composition.component;
		const folder = `test/__results__/webkit-ci-native-controls/${id}`;
		const archive = async (label: string, blob: Blob) => {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${label}.png`,
				btoa(binary),
				'base64',
			);
			return blob;
		};

		const still = await renderStillOnWeb({
			composition,
			frame: 0,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
			scale,
		});
		const actual = await archive('export', await still.blob({format: 'png'}));
		const reference = await archive(
			'native',
			await captureNativeReference(
				{
					...composition,
					width: composition.width * scale,
					height: composition.height * scale,
					component: () => (
						<div
							style={{
								position: 'absolute',
								width: composition.width,
								height: composition.height,
								transform: `scale(${scale})`,
								transformOrigin: '0 0',
							}}
						>
							<Scene />
						</div>
					),
				},
				0,
				{omitBackground: false},
			),
		);
		const comparison = await countNativePixels(reference, actual);
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify(comparison),
		);
		if (id.startsWith('sampler')) {
			const image = new Image();
			image.src = pixelatedRaster;
			await image.decode();
			for (const mode of [
				'default',
				'reset',
				'low',
				'medium',
				'high',
				'ordinary',
			] as const) {
				const canvas = new OffscreenCanvas(64, 128);
				try {
					const context = canvas.getContext('2d', {
						alpha: false,
						willReadFrequently: mode !== 'ordinary',
					})!;
					context.fillStyle = 'white';
					context.fillRect(0, 0, 64, 128);
					if (mode === 'reset') {
						context.imageSmoothingEnabled = false;
						context.imageSmoothingEnabled = true;
					}

					if (mode === 'low' || mode === 'medium' || mode === 'high')
						context.imageSmoothingQuality = mode;
					for (let y = 64; y < 128; y += 16)
						for (let x = 0; x < 64; x += 16)
							context.drawImage(image, x, y, 16, 16);
					const png = await archive(
						`replay-${mode}`,
						await canvas.convertToBlob({type: 'image/png'}),
					);
					await server.commands.writeFile(
						`${folder}/replay-${mode}.json`,
						JSON.stringify(await countNativePixels(reference, png)),
					);
				} finally {
					canvas.width = 0;
					canvas.height = 0;
				}
			}
		}

		expect(comparison.mismatchedPixels).toBe(0);
	},
);
