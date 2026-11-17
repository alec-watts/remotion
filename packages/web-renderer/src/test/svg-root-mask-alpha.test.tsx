import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgDefinitionFont,
	svgDefinitionFontUrl,
} from './fixtures/svg-font-definition-review';
import {captureNativeReference, countNativePixels} from './native-reference';

const paintOnWhite = async (blob: Blob) => {
	const bitmap = await createImageBitmap(blob);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	try {
		const context = canvas.getContext('2d', {willReadFrequently: true});
		if (!context) throw new Error('Cannot create replay context');
		context.fillStyle = 'white';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bitmap, 0, 0);
		return await canvas.convertToBlob({type: 'image/png'});
	} finally {
		bitmap.close();
		canvas.width = 0;
		canvas.height = 0;
	}
};

test.for(
	(['root-mask', 'filter-image'] as const).flatMap((mode) =>
		[0, 1].map((frame) => ({mode, frame})),
	),
)(
	'compares SVG $mode alpha and white matting on frame $frame',
	async ({mode, frame}) => {
		const composition = (backgroundColor: string) =>
			svgDefinitionFont({mode, fontUrl: svgDefinitionFontUrl, backgroundColor});
		const clear = composition('transparent');
		const white = composition('white');
		const exportPng = async (comp: typeof clear) =>
			(
				await renderStillOnWeb({
					composition: comp,
					inputProps: {},
					licenseKey: 'free-license',
					frame,
					allowHtmlInCanvas: false,
					transparent: true,
				})
			).blob({format: 'png'});
		const folder = `test/__results__/svg-root-mask-alpha/${server.browser}/${mode}/${frame}`;
		const images = new Map<string, Blob>();
		const errors: Record<string, string> = {};
		const capture = async (label: string, make: () => Promise<Blob>) => {
			try {
				const blob = await make();
				let bytes = '';
				for (const byte of new Uint8Array(await blob.arrayBuffer())) {
					bytes += String.fromCharCode(byte);
				}

				await server.commands.writeFile(
					`${folder}/${label}.png`,
					btoa(bytes),
					'base64',
				);
				images.set(label, blob);
			} catch (error) {
				errors[label] = String(error);
			}
		};

		await capture('native-white', () =>
			captureNativeReference(white, frame, {omitBackground: false}),
		);
		await capture('export-white', () => exportPng(white));
		await capture('native-clear', () =>
			captureNativeReference(clear, frame, {omitBackground: true}),
		);
		await capture('export-clear', () => exportPng(clear));
		for (const source of ['native', 'export']) {
			const clearPng = images.get(`${source}-clear`);
			if (clearPng) {
				await capture(`${source}-replay`, () => paintOnWhite(clearPng));
			}
		}

		const counts: Record<string, number | null> = {};
		for (const [a, b] of [
			['native-white', 'export-white'],
			['native-clear', 'export-clear'],
			['native-white', 'native-replay'],
			['export-white', 'export-replay'],
			['native-replay', 'export-replay'],
		]) {
			const before = images.get(a);
			const after = images.get(b);
			counts[`${a} vs ${b}`] =
				before && after
					? (await countNativePixels(before, after)).mismatchedPixels
					: null;
		}

		await server.commands.writeFile(
			`${folder}/summary.json`,
			JSON.stringify({counts, errors}),
		);
		expect.soft(counts['native-white vs export-white']).toBe(0);
		expect.soft(counts['native-clear vs export-clear']).toBe(0);
	},
);
