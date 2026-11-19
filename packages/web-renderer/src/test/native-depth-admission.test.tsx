import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {supportsNativeHtmlInCanvas} from '../html-in-canvas';
import {renderStillOnWeb} from '../render-still-on-web';
import {FallbackDepthScene, size} from './fixtures/preserve-3d-depth';
import {captureNativeReference, compareNativePixels} from './native-reference';

const saveImage = async (path: string, blob: Blob) => {
	let binary = '';
	for (const byte of new Uint8Array(await blob.arrayBuffer())) {
		binary += String.fromCharCode(byte);
	}

	await server.commands.writeFile(path, btoa(binary), 'base64');
};

test.each([
	'zero-flat',
	'coplanar-delay',
	'soft-inset',
	'implicit-gradient-stop',
	'trailing-gradient-stop',
	'perspective',
	'depth',
	'group',
	'offscreen',
	'oversized-opacity',
	'opacity-paint-bounds',
	'local-group-depth',
	'magnified-mask',
])('native depth admission matches every pixel for %s', async (kind) => {
	expect(server.browser).toBe('chromium');
	expect(supportsNativeHtmlInCanvas()).toBe(true);
	const fixture = {
		id: `native-depth-admission-${kind}`,
		component: () => <FallbackDepthScene kind={kind} />,
		...size,
		fps: 30,
		durationInFrames: 1,
	};
	const directory = `test/__results__/native-depth-admission/${kind}`;
	const reference = await captureNativeReference(fixture, 0, {
		omitBackground: false,
	});
	await saveImage(`${directory}/reference.png`, reference);
	const prototype =
		CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & {
			drawElementImage: (...args: unknown[]) => void;
		};
	const nativeCapture = vi.spyOn(prototype, 'drawElementImage');
	try {
		const result = await renderStillOnWeb({
			licenseKey: 'free-license',
			composition: {...fixture, calculateMetadata: null},
			frame: 0,
			inputProps: {},
			allowHtmlInCanvas: true,
			experimental3DRendering: true,
			transparent: false,
		});
		const actual = await result.blob({format: 'png'});
		await saveImage(`${directory}/actual.png`, actual);
		const comparison = await compareNativePixels(reference, actual);
		const successfulNativeCalls = nativeCapture.mock.results.filter(
			(call) => call.type === 'return',
		).length;
		await server.commands.writeFile(
			`${directory}/report.json`,
			JSON.stringify({
				kind,
				browser: server.browser,
				platform: server.platform,
				userAgent: navigator.userAgent,
				successfulNativeCalls,
				comparison,
			}),
		);
		expect.soft(successfulNativeCalls).toBeGreaterThan(0);
		expect(comparison.mismatchedPixels).toBe(0);
	} finally {
		nativeCapture.mockRestore();
	}
});
