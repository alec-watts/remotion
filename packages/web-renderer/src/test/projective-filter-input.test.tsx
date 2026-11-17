import '../symbol-dispose';
import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	filterInputCases,
	projectiveFilterInput,
} from './fixtures/projective-filter-input';
import {captureNativeReference, compareNativePixels} from './native-reference';

for (const {kind} of filterInputCases)
	for (const preserving of [false, true])
		for (const experimental3DRendering of [false, true]) {
			test(`retains ${kind} filter inputs preserving=${preserving} experimental=${experimental3DRendering}`, async () => {
				const composition = projectiveFilterInput(kind, preserving);
				const native = await captureNativeReference(composition, 0, {
					omitBackground: false,
				});
				const inputs: Blob[] = [];
				const original = OffscreenCanvas.prototype.convertToBlob;
				const captureInput =
					kind.endsWith('-visible') && experimental3DRendering;
				const spy = captureInput
					? vi
							.spyOn(OffscreenCanvas.prototype, 'convertToBlob')
							.mockImplementation(
								async function (this: OffscreenCanvas, options) {
									const blob = await original.call(this, options);
									if (options?.type === 'image/png') inputs.push(blob);
									return blob;
								},
							)
					: null;
				let actual: Blob;
				try {
					actual = await (
						await renderStillOnWeb({
							composition,
							frame: 0,
							inputProps: {},
							licenseKey: 'free-license',
							allowHtmlInCanvas: false,
							experimental3DRendering,
						})
					).blob({format: 'png'});
				} finally {
					spy?.mockRestore();
				}

				const result = await compareNativePixels(native, actual);
				const path = `test/__results__/filter-inputs/${server.browser}/${composition.id}-${experimental3DRendering}`;
				await Promise.all(
					[native, actual, ...inputs].map(async (blob, index) => {
						let binary = '';
						for (const byte of new Uint8Array(await blob.arrayBuffer()))
							binary += String.fromCharCode(byte);
						await server.commands.writeFile(
							`${path}/${index === 0 ? 'reference' : index === 1 ? 'actual' : 'capture-' + (index - 2)}.png`,
							btoa(binary),
							'base64',
						);
					}),
				);
				await server.commands.writeFile(
					`${path}/comparison.json`,
					JSON.stringify({
						kind,
						preserving,
						experimental3DRendering,
						mismatchedPixels: result.mismatchedPixels,
						maxChannelDelta: result.maxChannelDelta,
						captureCount: inputs.length,
						userAgent: navigator.userAgent,
						devicePixelRatio,
					}),
				);
				expect(result.mismatchedPixels).toBe(0);
			});
		}
