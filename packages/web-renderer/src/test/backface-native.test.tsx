import {expect, test} from 'vitest';
import {page, server} from 'vitest/browser';
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
		const capture = {ui: null as Blob | null, repeat: null as Blob | null};
		const native = await captureNativeReference(
			composition,
			frame,
			{
				omitBackground: false,
			},
			server.browser === 'webkit'
				? async (host) => {
						const commands = server.commands as typeof server.commands & {
							captureWebKitUi: (
								testId: string,
							) => Promise<{ui: string; repeat: string}>;
						};
						const result = await commands.captureWebKitUi(host.dataset.testid!);
						for (const name of ['ui', 'repeat'] as const) {
							capture[name] = new Blob(
								[
									Uint8Array.from(atob(result[name]), (char) =>
										char.charCodeAt(0),
									),
								],
								{type: 'image/png'},
							);
						}
					}
				: null,
		);
		const nativeDom = composition.getNativeMarkup();
		const host = document.createElement('div');
		host.dataset.testid = `plain-backface-${variant}-${frame}`;
		Object.assign(host.style, {
			position: 'relative',
			width: '300px',
			height: '300px',
			backgroundColor: 'white',
		});
		// Preserve the authored composition wrapper (including perspective), while
		// removing only the Player's surrounding DOM from this independent control.
		host.innerHTML = nativeDom.compositionMarkup;
		document.body.appendChild(host);
		let plain: Blob;
		try {
			for (let paint = 0; paint < 2; paint++) {
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
			}
			const screenshot: string | {base64: string} = await page
				.getByTestId(host.dataset.testid)
				.screenshot({
					base64: true,
					save: false,
					omitBackground: false,
					scale: 'css',
					style:
						'html, body, iframe[data-vitest] { background: transparent !important; }',
				});
			const base64 =
				typeof screenshot === 'string' ? screenshot : screenshot.base64;
			plain = new Blob(
				[Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
				{type: 'image/png'},
			);
		} finally {
			host.remove();
		}
		const plainComparison = await compareNativePixels(native, plain);
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
		const uiComparison = capture.ui
			? await compareNativePixels(capture.ui, enabled)
			: null;
		const repeatComparison = capture.repeat
			? await compareNativePixels(native, capture.repeat)
			: null;
		const path = `test/__results__/backface-evidence/${server.browser}/${variant}-${frame}`;
		for (const [name, blob] of [
			['native', native],
			['plain-dom', plain],
			['default', defaultOutput],
			['enabled', enabled],
			...(capture.ui && capture.repeat
				? ([
						['ui-process', capture.ui],
						['native-after-ui', capture.repeat],
					] as const)
				: []),
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
				nativeDom,
				plainDomMismatchedPixels: plainComparison.mismatchedPixels,
				uiMismatchedPixels: uiComparison?.mismatchedPixels ?? null,
				repeatMismatchedPixels: repeatComparison?.mismatchedPixels ?? null,
				defaultMismatchedPixels: ordinary.mismatchedPixels,
				enabledMismatchedPixels: experimental.mismatchedPixels,
			}),
		);
		expect(ordinary.mismatchedPixels, 'default output').toBe(0);
		expect(experimental.mismatchedPixels, 'experimental output').toBe(0);
		expect(plainComparison.mismatchedPixels, 'Player versus plain DOM').toBe(0);
		if (uiComparison)
			expect(uiComparison.mismatchedPixels, 'UI-process output').toBe(0);
		if (repeatComparison)
			expect(
				repeatComparison.mismatchedPixels,
				'snapshot after UI capture',
			).toBe(0);
	},
);
