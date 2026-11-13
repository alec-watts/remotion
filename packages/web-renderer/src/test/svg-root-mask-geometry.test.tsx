import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgRootMaskGeometry,
	svgRootMaskModes,
} from './fixtures/svg-root-mask-geometry';
import {captureNativeReference, compareNativePixels} from './native-reference';

test.for(
	svgRootMaskModes.flatMap((mode) => [1, 1.5].map((scale) => ({mode, scale}))),
)('matches native root SVG mask $mode scale $scale', async ({mode, scale}) => {
	const composition = svgRootMaskGeometry(mode, scale);
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
		})
	).blob({format: 'png'});
	const comparison = await compareNativePixels(native, actual);
	const path = `test/__results__/svg-mask-geometry/${server.browser}/${mode}-${scale}`;
	const hashes: string[] = [];
	for (const [role, blob] of [
		['reference', native],
		['actual', actual],
	] as const) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`${path}/${role}.png`,
			btoa(binary),
			'base64',
		);
		hashes.push(
			Array.from(
				new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
				(byte) => byte.toString(16).padStart(2, '0'),
			).join(''),
		);
	}

	await server.commands.writeFile(
		`${path}/comparison.json`,
		JSON.stringify({
			testName: `matches native root SVG mask ${mode} scale ${scale}`,
			browser: server.browser,
			platform: server.platform,
			userAgent: navigator.userAgent,
			devicePixelRatio: window.devicePixelRatio,
			mismatchedPixels: comparison.mismatchedPixels,
			maxChannelDelta: comparison.maxChannelDelta,
			referenceSha256: hashes[0],
			actualSha256: hashes[1],
		}),
	);
	expect(comparison.mismatchedPixels).toBe(0);
});
