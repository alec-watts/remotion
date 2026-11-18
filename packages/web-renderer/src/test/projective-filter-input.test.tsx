import '../symbol-dispose';
import {expect, test} from 'vitest';
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
				const actual = await (
					await renderStillOnWeb({
						composition,
						frame: 0,
						inputProps: {},
						licenseKey: 'free-license',
						allowHtmlInCanvas: false,
						experimental3DRendering,
					})
				).blob({format: 'png'});
				const result = await compareNativePixels(native, actual);
				const path = `test/__results__/filter-inputs/${server.browser}/${composition.id}-${experimental3DRendering}`;
				await Promise.all(
					[native, actual].map(async (blob, index) => {
						let binary = '';
						for (const byte of new Uint8Array(await blob.arrayBuffer()))
							binary += String.fromCharCode(byte);
						await server.commands.writeFile(
							`${path}/${index === 0 ? 'reference' : 'actual'}.png`,
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
						userAgent: navigator.userAgent,
						devicePixelRatio,
					}),
				);
				expect(result.mismatchedPixels).toBe(0);
			});
		}
