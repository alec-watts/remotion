import {useLayoutEffect, useRef} from 'react';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgPrecomposeFont} from './fixtures/svg-precompose-font';
import {captureNativeReference, countNativePixels} from './native-reference';

const cases = (['registered', 'import'] as const).flatMap((source) =>
	(['stroke', null] as const).flatMap((paint) =>
		[false, true].flatMap((literal) =>
			[0, 1].map((frame) => ({source, paint, literal, frame})),
		),
	),
);

test.for(cases)(
	'compares native SVG source=$source paint=$paint literal=$literal frame=$frame',
	async ({source, paint, literal, frame}) => {
		const composition = svgPrecomposeFont({
			source,
			effect: 'blend',
			literal,
			fontStep: null,
			paint,
		});
		const native = await captureNativeReference(composition, frame, {
			omitBackground: false,
		});
		const actual = await (
			await renderStillOnWeb({
				composition,
				frame,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		let markup: string | null = null;
		const Component = composition.component;
		const Capture = () => {
			const ref = useRef<HTMLDivElement>(null);
			useLayoutEffect(() => {
				const sourceElement = ref.current!;
				const clone = sourceElement.cloneNode(true) as HTMLDivElement;
				const originals = [
					sourceElement,
					...sourceElement.querySelectorAll('*'),
				];
				const copies = [clone, ...clone.querySelectorAll('*')];
				for (const [index, element] of originals.entries()) {
					const computed = getComputedStyle(element);
					for (const property of Array.from(computed)) {
						(copies[index] as HTMLElement | SVGElement).style.setProperty(
							property,
							computed.getPropertyValue(property),
						);
					}
				}

				for (const style of clone.querySelectorAll('style')) style.remove();
				markup = new XMLSerializer().serializeToString(clone);
			}, []);
			return (
				<div ref={ref} style={{position: 'relative', width: 320, height: 100}}>
					<Component />
				</div>
			);
		};

		const wrapped = await captureNativeReference(
			{...composition, component: Capture, id: `${composition.id}-wrapped`},
			frame,
			{omitBackground: false},
		);
		if (markup === null)
			throw new Error('Foreign-object source was not committed');
		const font = await fetch(
			new URL('../../../example/public/bangers.woff2', import.meta.url),
		);
		if (!font.ok)
			throw new Error(`Font fixture request failed: ${font.status}`);
		let fontBinary = '';
		for (const byte of new Uint8Array(await font.arrayBuffer()))
			fontBinary += String.fromCharCode(byte);
		const fontData = `data:font/woff2;base64,${btoa(fontBinary)}`;
		const fontCss = ['External SVG, class font', 'SVG precompose imported font']
			.map(
				(family) =>
					`@font-face{font-family:"${family}";src:url("${fontData}") format("woff2")}`,
			)
			.join('');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><style>${fontCss}</style><foreignObject width="320" height="100">${markup}</foreignObject></svg>`;
		const image = new Image();
		const canvas = new OffscreenCanvas(320, 100);
		let foreignObject: Blob;
		try {
			image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
			await image.decode();
			const context = canvas.getContext('2d')!;
			context.fillStyle = 'white';
			context.fillRect(0, 0, 320, 100);
			context.drawImage(image, 0, 0);
			foreignObject = await canvas.convertToBlob({type: 'image/png'});
		} finally {
			image.src = '';
			canvas.width = 0;
			canvas.height = 0;
		}

		const difference = await countNativePixels(native, actual);
		const wrappedDifference = await countNativePixels(native, wrapped);
		const foreignObjectDifference = await countNativePixels(
			native,
			foreignObject,
		);
		const path = `test/__results__/svg-stroke-native/${server.browser}/${source}-${paint ?? 'none'}-${literal}-${frame}`;
		for (const [name, blob] of [
			['native', native],
			['actual', actual],
			['wrapped-native', wrapped],
			['foreign-object', foreignObject],
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

		await server.commands.writeFile(`${path}/source.svg`, svg);
		await server.commands.writeFile(
			`${path}/comparison.json`,
			JSON.stringify({
				source,
				paint,
				literal,
				frame,
				browser: server.browser,
				userAgent: navigator.userAgent,
				devicePixelRatio: window.devicePixelRatio,
				wrappedDifference,
				foreignObjectDifference,
				...difference,
			}),
		);
		expect.soft(wrappedDifference.mismatchedPixels).toBe(0);
		expect.soft(foreignObjectDifference.mismatchedPixels).toBe(0);
		expect(difference.mismatchedPixels).toBe(0);
	},
);
