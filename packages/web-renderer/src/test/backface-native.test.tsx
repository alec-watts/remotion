import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {backfaceNative, backfaceNativeCases} from './fixtures/backface-native';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for(
	backfaceNativeCases.flatMap((variant) =>
		[0, 1].map((frame) => ({variant, frame})),
	),
)(
	'matches native backface painting for $variant frame=$frame',
	async ({variant, frame}) => {
		const composition = backfaceNative(variant);
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
		const path = `test/__results__/backface-evidence/${server.browser}/${variant}-${frame}`;
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
		expect(ordinary.mismatchedPixels, 'default output').toBe(0);
		expect(experimental.mismatchedPixels, 'experimental output').toBe(0);
	},
);
