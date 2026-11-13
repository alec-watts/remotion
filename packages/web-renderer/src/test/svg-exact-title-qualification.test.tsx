import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgExactTitleFont} from './fixtures/svg-exact-title-font';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	[
		{title: 'A', inactiveTitle: ' A '},
		{title: ' A ', inactiveTitle: 'A'},
		{title: 'A ', inactiveTitle: ' A'},
		{title: ' ', inactiveTitle: '\t'},
		{title: 'Å', inactiveTitle: 'å'},
		{title: 'A', inactiveTitle: 'a'},
	].flatMap((titles, index) =>
		[false, true].map((firstRoboto) => ({...titles, index, firstRoboto})),
	),
)(
	'preserves exact title pair $index with Roboto=$firstRoboto',
	async ({title, inactiveTitle, index, firstRoboto}) => {
		const composition = svgExactTitleFont({
			title,
			inactiveTitle,
			firstRoboto,
			literal: false,
		});
		const literal = svgExactTitleFont({
			title,
			inactiveTitle,
			firstRoboto,
			literal: true,
		});
		const native = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const nativeControl = await captureNativeReference(literal, 0, {
			omitBackground: false,
		});
		const render = async (selected: typeof composition) => {
			const result = await renderStillOnWeb({
				licenseKey: 'free-license',
				composition: selected,
				frame: 0,
				inputProps: {},
				allowHtmlInCanvas: false,
			});
			return result.blob({format: 'png'});
		};

		const actual = await render(composition);
		const control = await render(literal);
		const nativeControlPixels = await countNativePixels(nativeControl, native);
		const nativePixels = await countNativePixels(native, actual);
		const controlPixels = await countNativePixels(control, actual);
		const path = `test/__results__/exact-titles/${server.browser}/${index}-${firstRoboto}`;
		for (const [role, blob] of [
			['native', native],
			['native-control', nativeControl],
			['actual', actual],
			['control', control],
		] as const) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${role}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			`${path}/comparison.json`,
			JSON.stringify({
				title,
				inactiveTitle,
				firstRoboto,
				nativeControlPixels,
				nativePixels,
				controlPixels,
			}),
		);
		expect.soft(nativeControlPixels.mismatchedPixels).toBe(0);
		expect.soft(controlPixels.mismatchedPixels).toBe(0);
		expect(nativePixels.mismatchedPixels).toBe(0);
	},
);
