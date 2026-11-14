import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	filteredGradientCases,
	filteredGradientModes,
	gradientFilterInput,
} from './fixtures/gradient-filter-input';
import {captureNativeReference, compareNativePixels} from './native-reference';

// Exercise the affected capability branch with real canvas pixels in every
// engine, including engines whose default gradient probe does not select it.
vi.mock('../internal-state', async (importOriginal) => {
	const original = await importOriginal<typeof import('../internal-state')>();
	return {
		...original,
		makeInternalState: (
			...args: Parameters<typeof original.makeInternalState>
		) => {
			const state = original.makeInternalState(...args);
			state.canvasContextState.willReadFrequently = true;
			return state;
		},
	};
});

// Fork-only qualification: retain every strict reference, including passing cases.
test.for(
	filteredGradientCases.flatMap(({side}) =>
		filteredGradientModes.flatMap((mode) =>
			[0, 1].map((frame) => ({side, mode, frame})),
		),
	),
)(
	'matches native filtered gradient $side $mode frame $frame',
	async ({side, mode, frame}) => {
		const composition = gradientFilterInput(side, mode);
		// The authored scene is entirely opaque, so Firefox needs no transparent override.
		const reference = await captureNativeReference(composition, frame, {
			omitBackground: false,
		});
		const actual = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition,
				frame,
				inputProps: {},
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		const result = await compareNativePixels(reference, actual);
		const dir = `test/__results__/gradient-input-native/${server.browser}/${side}-${mode}-${frame}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
			['diff', result.diff],
		] as const) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${dir}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${dir}/comparison.json`,
			JSON.stringify(
				{
					browser: server.browser,
					platform: server.platform,
					runtime: server.version,
					userAgent: navigator.userAgent,
					devicePixelRatio: window.devicePixelRatio,
					mismatchedPixels: result.mismatchedPixels,
					maxChannelDelta: result.maxChannelDelta,
				},
				null,
				2,
			),
		);
		expect(result.mismatchedPixels).toBe(0);
	},
);
