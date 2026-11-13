import {expect} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgExactTitleFont} from './fixtures/svg-exact-title-font';
import {captureNativeReference, countNativePixels} from './native-reference';

export const qualifySvgExactTitle = async ({
	title,
	inactiveTitle,
	index,
	firstRoboto,
}: {
	title: string;
	inactiveTitle: string;
	index: number;
	firstRoboto: boolean;
}) => {
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
	const distinct = svgExactTitleFont({
		title,
		inactiveTitle: 'distinct-control',
		firstRoboto,
		literal: false,
	});
	const nativeDistinct = await captureNativeReference(distinct, 0, {
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
	const distinctControl = await render(distinct);
	const distinctNativePixels = await countNativePixels(nativeDistinct, native);
	const distinctControlPixels = await countNativePixels(
		distinctControl,
		actual,
	);
	const nativeControlPixels = await countNativePixels(nativeControl, native);
	const nativePixels = await countNativePixels(native, actual);
	const controlPixels = await countNativePixels(control, actual);
	const path = `test/__results__/exact-titles/${server.browser}/${index}-${firstRoboto}`;
	for (const [role, blob] of [
		['native', native],
		['native-control', nativeControl],
		['actual', actual],
		['control', control],
		['native-distinct', nativeDistinct],
		['distinct-control', distinctControl],
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
			distinctNativePixels,
			distinctControlPixels,
		}),
	);
	expect.soft(nativeControlPixels.mismatchedPixels).toBe(0);
	expect.soft(controlPixels.mismatchedPixels).toBe(0);
	expect.soft(distinctNativePixels.mismatchedPixels).toBe(0);
	expect.soft(distinctControlPixels.mismatchedPixels).toBe(0);
	expect(nativePixels.mismatchedPixels).toBe(0);
};
