import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {makeScaledShadowFixture} from './fixtures/affine-filter-stress';
import {captureNativeReference, compareNativePixels} from './native-reference';

const filterInputReviewCases = [
	'fractional',
	'rounded',
	'blurred',
	'textured',
	'scaled',
	'reflected',
	'negative',
] as const;

test.for(
	filterInputReviewCases.flatMap((variant) =>
		[false, true].flatMap((preserve) =>
			[0, 1].map((frame) => ({variant, preserve, frame})),
		),
	),
)(
	'retains native filter pixels for $variant preserve=$preserve frame=$frame',
	async ({variant, preserve, frame}) => {
		const composition = makeScaledShadowFixture(variant, preserve);
		const native = await captureNativeReference(composition, frame, {
			omitBackground: false,
		});
		const render = async (experimental3DRendering: boolean) =>
			(
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition,
					frame,
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering,
				})
			).blob({format: 'png'});
		const defaultOutput = await render(false);
		const enabled = await render(true);
		const ordinary = await compareNativePixels(native, defaultOutput);
		const experimental = await compareNativePixels(native, enabled);
		const path = `test/__results__/affine-stress-evidence/${server.browser}/${variant}-${preserve}-${frame}`;
		for (const [name, blob] of [
			['native', native],
			['default', defaultOutput],
			['enabled', enabled],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${path}/comparison.json`,
			JSON.stringify({
				variant,
				preserve,
				frame,
				browser: server.browser,
				platform: server.platform,
				runtime: server.version,
				userAgent: navigator.userAgent,
				devicePixelRatio: window.devicePixelRatio,
				defaultMismatchedPixels: ordinary.mismatchedPixels,
				enabledMismatchedPixels: experimental.mismatchedPixels,
			}),
		);
		expect(experimental.mismatchedPixels).toBe(0);
	},
);
