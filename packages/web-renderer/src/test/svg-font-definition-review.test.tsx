import {NoReactInternals} from 'remotion/no-react';
import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgDefinitionModes,
	svgPaintResourceFontSize,
	svgDefinitionFont,
	svgDefinitionFontUrl,
	svgWildcardStyleModes,
	svgWildcardStyle,
} from './fixtures/svg-font-definition-review';
import {
	captureNativeReference,
	compareNativePixels,
	countNativePixels,
} from './native-reference';
import {testCompositions} from './utils';

test('preserves wildcard style selectors', async () => {
	await testCompositions({
		cases: svgWildcardStyleModes.map((mode) => ({
			composition: svgWildcardStyle({mode, literal: false}),
			frame: 1,
		})),
		columns: 3,
		testId: 'svg-wildcard-style-selectors',
		scale: null,
	});
});

test.for(
	svgDefinitionModes.flatMap((mode) => [1].map((frame) => ({mode, frame}))),
)(
	'fetches only instantiated definition $mode frame $frame',
	async ({mode, frame}) => {
		const data = await (await fetch(svgDefinitionFontUrl)).arrayBuffer();
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(new Blob([data], {type: 'font/woff2'}));
		});
		const composition = svgDefinitionFont({
			mode,
			fontUrl: svgDefinitionFontUrl,
		});
		const control = svgDefinitionFont({mode, fontUrl: dataUrl});
		const used =
			mode === 'direct' ||
			mode === 'use-target' ||
			mode === 'nested' ||
			mode === 'symbol';
		const fetchFont = vi.spyOn(NoReactInternals, 'fetchFontData');
		if (used) fetchFont.mockResolvedValue(data);
		else
			fetchFont.mockRejectedValue(
				new Error('Unused definition font must not be requested'),
			);
		try {
			const options = {
				frame,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
			} as const;
			const actual = await (
				await renderStillOnWeb({...options, composition})
			).blob({format: 'png'});
			expect(fetchFont).toHaveBeenCalledTimes(used ? 1 : 0);
			const expected = await (
				await renderStillOnWeb({...options, composition: control})
			).blob({format: 'png'});
			expect((await countNativePixels(expected, actual)).mismatchedPixels).toBe(
				0,
			);
		} finally {
			fetchFont.mockRestore();
		}
	},
);

test.for(
	(['pattern', 'mask'] as const).flatMap((kind) =>
		[false, true].map((inDefs) => ({kind, inDefs})),
	),
)(
	'preserves external font size in $kind resource, defs=$inDefs',
	async ({kind, inDefs}) => {
		const composition = svgPaintResourceFontSize({kind, inDefs, literal: false});
		const native = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const options = {
			frame: 0,
			inputProps: {},
			licenseKey: 'free-license',
			allowHtmlInCanvas: false,
		} as const;
		const actual = await (
			await renderStillOnWeb({...options, composition})
		).blob({format: 'png'});
		const control = await (
			await renderStillOnWeb({
				...options,
				composition: svgPaintResourceFontSize({kind, inDefs, literal: true}),
			})
		).blob({format: 'png'});
		const controlPixels = await countNativePixels(control, actual);
		const nativePixels = await compareNativePixels(native, actual);
		const path = `test/__results__/paint-resource-font/${server.browser}/${kind}-${inDefs}`;
		for (const [name, blob] of [
			['native', native],
			['actual', actual],
			['control', control],
		] as const) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${path}/comparison.json`,
			JSON.stringify({controlPixels, nativePixels}),
		);
		expect.soft(controlPixels.mismatchedPixels).toBe(0);
		expect(nativePixels.mismatchedPixels).toBe(0);
	},
);
