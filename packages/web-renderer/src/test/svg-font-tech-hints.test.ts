import {NoReactInternals} from 'remotion/no-react';
import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {
	getSvgFontSnapshot,
	turnSvgIntoDrawable,
} from '../drawing/turn-svg-into-drawable';
import {countNativePixels} from './native-reference';

const png = async (image: HTMLImageElement) => {
	const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not create font comparison context');
	context.drawImage(image, 0, 0);
	return canvas.convertToBlob({type: 'image/png'});
};

test.for(
	[false, true].flatMap((imported) =>
		[false, true].map((format) => ({imported, format})),
	),
)(
	'embeds a loaded tech-hinted font, imported=$imported format=$format',
	async ({imported, format}) => {
		const fontUrl = new URL(
			'../../../example/public/bangers.woff2',
			import.meta.url,
		).href;
		const bytes = await (await fetch(fontUrl)).arrayBuffer();
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(new Blob([bytes], {type: 'font/woff2'}));
		});
		const family = `Technology hints ${imported} ${format}`;
		const declaration = `@font-face{font-family:"${family}";src:url("${fontUrl}") ${format ? 'format("woff2") ' : ''}tech(variations)}`;
		const style = document.createElement('style');
		const importUrl = imported
			? URL.createObjectURL(new Blob([declaration], {type: 'text/css'}))
			: null;
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '320');
		svg.setAttribute('height', '100');
		svg.style.cssText = 'width:320px;height:100px;transform:translateX(3px)';
		svg.innerHTML = `<text x="8" y="60" font-family="${family}" font-size="40">Hinted font</text>`;
		let control: SVGSVGElement | null = null;
		try {
			if (importUrl !== null) {
				const loaded = new Promise<void>((resolve, reject) => {
					style.onload = () => resolve();
					style.onerror = () =>
						reject(new Error('Could not load imported font sheet'));
				});
				style.textContent = `@import url("${importUrl}");`;
				document.head.appendChild(style);
				await loaded;
			} else {
				style.textContent = declaration;
				document.head.appendChild(style);
			}

			document.body.appendChild(svg);
			const faces = await document.fonts.load(`40px "${family}"`);
			expect(faces).toHaveLength(1);
			expect(faces[0].status).toBe('loaded');
			const originalStyle = svg.getAttribute('style');
			const snapshot = getSvgFontSnapshot(svg);
			expect
				.soft(snapshot.cssFontRules.some((rule) => rule.url === fontUrl))
				.toBe(true);
			const fetchFont = vi
				.spyOn(NoReactInternals, 'fetchFontData')
				.mockResolvedValue(bytes);
			try {
				const actual = await png(await turnSvgIntoDrawable(svg));
				expect.soft(fetchFont).toHaveBeenCalledTimes(1);
				expect(svg.getAttribute('style')).toBe(originalStyle);
				control = svg.cloneNode(true) as SVGSVGElement;
				control.insertAdjacentHTML(
					'afterbegin',
					`<style>@font-face{font-family:"${family}";src:url("${dataUrl}")}</style>`,
				);
				document.body.appendChild(control);
				const expected = await png(await turnSvgIntoDrawable(control));
				const comparison = await countNativePixels(expected, actual);
				const path = `test/__results__/font-tech-hints/${server.browser}/${imported}-${format}`;
				for (const [role, blob] of [
					['actual', actual],
					['control', expected],
				] as const) {
					const data = new Uint8Array(await blob.arrayBuffer());
					let binary = '';
					for (const byte of data) binary += String.fromCharCode(byte);
					await server.commands.writeFile(
						`${path}/${role}.png`,
						btoa(binary),
						'base64',
					);
				}

				await server.commands.writeFile(
					`${path}/comparison.json`,
					JSON.stringify(comparison),
				);
				expect(comparison.mismatchedPixels).toBe(0);
			} finally {
				fetchFont.mockRestore();
			}
		} finally {
			control?.remove();
			svg.remove();
			style.remove();
			if (importUrl !== null) URL.revokeObjectURL(importUrl);
		}
	},
);
