import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {
	linearGradient,
	linearGradientHardStops,
} from './fixtures/linear-gradient';
import {captureNativeReference, countNativePixels} from './native-reference';

for (const fixture of [linearGradient, linearGradientHardStops]) {
	for (const scale of [1, 2]) {
		test(`preserves native gradient pixels ${fixture.id} scale=${scale}`, async () => {
			const Component = fixture.component;
			const reference = await captureNativeReference(
				{
					...fixture,
					width: fixture.width * scale,
					height: fixture.height * scale,
					component: () => (
						<div
							style={{
								position: 'absolute',
								width: fixture.width,
								height: fixture.height,
								transform: `scale(${scale})`,
								transformOrigin: '0 0',
							}}
						>
							<Component />
						</div>
					),
				},
				0,
				{omitBackground: false},
			);
			const start = performance.now();
			const actual = await (
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition: fixture,
					frame: 0,
					scale,
					inputProps: {},
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
			const elapsed = performance.now() - start;
			const pixels = await countNativePixels(reference, actual);
			const prefix = `test/__results__/native-gradient/${server.browser}/${fixture.id}-${scale}`;
			for (const [role, blob] of [
				['reference', reference],
				['actual', actual],
			] as const) {
				let binary = '';
				for (const byte of new Uint8Array(await blob.arrayBuffer()))
					binary += String.fromCharCode(byte);
				await server.commands.writeFile(
					`${prefix}/${role}.png`,
					btoa(binary),
					'base64',
				);
			}

			await server.commands.writeFile(
				`${prefix}/comparison.json`,
				JSON.stringify({
					...pixels,
					elapsed,
					userAgent: navigator.userAgent,
					devicePixelRatio,
					scale,
					fixture: fixture.id,
				}),
			);
			expect(pixels.mismatchedPixels).toBe(0);
		});
	}
}
