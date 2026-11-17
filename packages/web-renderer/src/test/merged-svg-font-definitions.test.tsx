import {NoReactInternals} from 'remotion/no-react';
import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderFramesOnWeb, renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {
	svgDefinitionFont,
	svgDefinitionFontUrl,
} from './fixtures/svg-font-definition-review';
import {captureNativeReference, countNativePixels} from './native-reference';

const frames = [0, 1];

const writePng = async (filename: string, png: Blob) => {
	let bytes = '';
	for (const byte of new Uint8Array(await png.arrayBuffer())) {
		bytes += String.fromCharCode(byte);
	}

	await server.commands.writeFile(filename, btoa(bytes), 'base64');
};

test.for(['root-mask', 'filter-image', 'direct'] as const)(
	'compares native, still and batch SVG font pixels for %s',
	async (mode) => {
		const response = await fetch(svgDefinitionFontUrl);
		if (!response.ok) {
			throw new Error(`Font fixture returned ${response.status}`);
		}

		const font = new Blob([await response.arrayBuffer()], {type: 'font/woff2'});
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(font);
		});
		const url = svgDefinitionFont({mode, fontUrl: svgDefinitionFontUrl});
		const data = svgDefinitionFont({mode, fontUrl: dataUrl});
		const options = {
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		} as const;
		const still = async (composition: typeof url, frame: number) =>
			(await renderStillOnWeb({...options, composition, frame})).blob({
				format: 'png',
			});
		const batch = async (composition: typeof url) => {
			const output = await renderFramesOnWeb({...options, composition, frames});
			return Promise.all(output.map((item) => item.blob({format: 'png'})));
		};

		const folder = `test/__results__/merged-svg-font/${server.browser}/${mode}`;
		const pngs: Record<string, Blob | string> = {};
		const capture = async (name: string, collect: () => Promise<Blob>) => {
			try {
				const png = await collect();
				await writePng(`${folder}/${name}.png`, png);
				pngs[name] = png;
			} catch (error) {
				pngs[name] = String(error);
			}
		};

		const captureBatch = async (
			source: 'url' | 'data',
			composition: typeof url,
		) => {
			const fetched = vi.spyOn(NoReactInternals, 'fetchFontData');
			try {
				const output = batch(composition);
				output.catch(() => undefined);
				for (const [index, frame] of frames.entries()) {
					await capture(`batch-${source}-${frame}`, async () => {
						const images = await output;
						expect(images).toHaveLength(frames.length);
						return images[index]!;
					});
				}

				return fetched.mock.calls.length;
			} finally {
				fetched.mockRestore();
			}
		};

		for (const frame of frames) {
			await capture(`native-url-${frame}`, () =>
				captureNativeReference(url, frame, {omitBackground: false}),
			);
			await capture(`native-data-${frame}`, () =>
				captureNativeReference(data, frame, {omitBackground: false}),
			);
		}

		const batchFetchCounts = {
			url: await captureBatch('url', url),
			data: await captureBatch('data', data),
		};
		for (const frame of frames) {
			await capture(`still-url-${frame}`, () => still(url, frame));
			await capture(`still-data-${frame}`, () => still(data, frame));
		}

		const comparisons: Record<string, number | null> = {};
		for (const frame of frames) {
			for (const [reference, actual] of [
				['native-url', 'native-data'],
				['still-url', 'still-data'],
				['batch-url', 'batch-data'],
				['still-url', 'batch-url'],
				['still-data', 'batch-data'],
				['native-url', 'still-url'],
				['native-data', 'still-data'],
			]) {
				const before = pngs[`${reference}-${frame}`];
				const after = pngs[`${actual}-${frame}`];
				const name = `${reference} vs ${actual} at frame ${frame}`;
				comparisons[name] =
					before instanceof Blob && after instanceof Blob
						? (await countNativePixels(before, after)).mismatchedPixels
						: null;
			}
		}

		await server.commands.writeFile(
			`${folder}/summary.json`,
			JSON.stringify({
				comparisons,
				batchFetchCounts,
				errors: Object.fromEntries(
					Object.entries(pngs).filter(([, png]) => typeof png === 'string'),
				),
			}),
		);
		for (const [name, result] of Object.entries(comparisons)) {
			expect.soft(result, name).toBe(0);
		}
	},
);
