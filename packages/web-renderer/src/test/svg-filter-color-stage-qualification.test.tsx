import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {compareNativePixels} from './native-reference';

test('retains source colors through each SVG image and filter stage', async () => {
	const source = new OffscreenCanvas(64, 32);
	const context = source.getContext('2d')!;
	const colors = [
		'rgb(40,80,160)',
		'rgb(130,70,90)',
		'rgb(17,115,171)',
		'rgb(220,60,20)',
		'rgb(0,0,0)',
		'rgb(255,255,255)',
		'rgba(40,80,160,0.5)',
		'rgba(220,60,20,0.5)',
	];
	for (const [index, color] of colors.entries()) {
		context.fillStyle = color;
		context.fillRect(index * 8, 0, 8, 32);
	}

	const reference = await source.convertToBlob({type: 'image/png'});
	const input = context.getImageData(0, 0, 64, 32).data;
	const raw = new Uint8Array(await reference.arrayBuffer());
	let binary = '';
	for (const byte of raw) binary += String.fromCharCode(byte);
	const data = 'data:image/png;base64,' + btoa(binary);
	const variants = [
		{
			name: 'plain',
			primitive: null,
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'matrix-srgb',
			primitive: 'matrix',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'matrix-inline-srgb',
			primitive: 'matrix',
			target: 'image',
			space: 'sRGB',
			inline: true,
			feImage: false,
		},
		{
			name: 'matrix-linear',
			primitive: 'matrix',
			target: 'image',
			space: 'linearRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'transfer-srgb',
			primitive: 'transfer',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'offset-srgb',
			primitive: 'offset',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'blur-zero-srgb',
			primitive: 'blur',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'shadow-image',
			primitive: 'shadow',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'shadow-group',
			primitive: 'shadow',
			target: 'group',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'shadow-root',
			primitive: 'shadow',
			target: 'root',
			space: 'sRGB',
			inline: false,
			feImage: false,
		},
		{
			name: 'feimage-matrix',
			primitive: 'matrix',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: true,
		},
		{
			name: 'feimage-shadow',
			primitive: 'shadow',
			target: 'image',
			space: 'sRGB',
			inline: false,
			feImage: true,
		},
	];
	const results: {
		name: string;
		wrong: number | null;
		opaqueWrong: number | null;
		max: number | null;
		error: string | null;
		samples: number[][] | null;
	}[] = [];
	const directory =
		'test/__results__/svg-filter-color-stages/' + server.browser;
	try {
		for (const variant of variants) {
			const canvas = new OffscreenCanvas(64, 32);
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('width', '64');
			svg.setAttribute('height', '32');
			const image = document.createElementNS(svg.namespaceURI, 'image');
			image.setAttribute('href', data);
			image.setAttribute('width', '64');
			image.setAttribute('height', '32');
			if (variant.primitive !== null) {
				const filter = document.createElementNS(svg.namespaceURI, 'filter');
				filter.id = 'color-stage';
				for (const [key, value] of Object.entries({
					filterUnits: 'userSpaceOnUse',
					primitiveUnits: 'userSpaceOnUse',
					x: '0',
					y: '0',
					width: '64',
					height: '32',
					'color-interpolation-filters': variant.space,
				}))
					filter.setAttribute(key, value);
				if (variant.feImage) {
					const inputImage = document.createElementNS(
						svg.namespaceURI,
						'feImage',
					);
					for (const [key, value] of Object.entries({
						href: data,
						x: '0',
						y: '0',
						width: '64',
						height: '32',
						preserveAspectRatio: 'none',
					}))
						inputImage.setAttribute(key, value);
					filter.appendChild(inputImage);
				}

				const primitive = document.createElementNS(
					svg.namespaceURI,
					variant.primitive === 'matrix'
						? 'feColorMatrix'
						: variant.primitive === 'transfer'
							? 'feComponentTransfer'
							: variant.primitive === 'offset'
								? 'feOffset'
								: variant.primitive === 'blur'
									? 'feGaussianBlur'
									: 'feDropShadow',
				);
				primitive.setAttribute('color-interpolation-filters', variant.space);
				if (variant.inline)
					primitive.setAttribute(
						'style',
						'color-interpolation-filters:' + variant.space,
					);
				if (variant.primitive === 'matrix') {
					primitive.setAttribute('type', 'matrix');
					primitive.setAttribute(
						'values',
						'1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0',
					);
				} else if (variant.primitive === 'transfer') {
					for (const channel of ['R', 'G', 'B', 'A']) {
						const fn = document.createElementNS(
							svg.namespaceURI,
							'feFunc' + channel,
						);
						fn.setAttribute('type', 'linear');
						fn.setAttribute('slope', '1');
						fn.setAttribute('intercept', '0');
						primitive.appendChild(fn);
					}
				} else if (variant.primitive === 'offset') {
					primitive.setAttribute('dx', '0');
					primitive.setAttribute('dy', '0');
				} else if (variant.primitive === 'blur')
					primitive.setAttribute('stdDeviation', '0');
				else {
					primitive.setAttribute('dx', '0');
					primitive.setAttribute('dy', '0');
					primitive.setAttribute('stdDeviation', '0');
					primitive.setAttribute('flood-color', 'transparent');
				}

				filter.appendChild(primitive);
				svg.appendChild(filter);
				if (variant.target === 'group') {
					const group = document.createElementNS(svg.namespaceURI, 'g');
					group.setAttribute('filter', 'url(#color-stage)');
					group.appendChild(image);
					svg.appendChild(group);
				} else {
					if (variant.target === 'root')
						svg.setAttribute('filter', 'url(#color-stage)');
					else image.setAttribute('filter', 'url(#color-stage)');
					svg.appendChild(image);
				}
			} else svg.appendChild(image);
			try {
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(await turnSvgIntoDrawable(svg as SVGSVGElement), 0, 0);
				const actual = await canvas.convertToBlob({type: 'image/png'});
				const output = ctx.getImageData(0, 0, 64, 32).data;
				let opaqueWrong = 0;
				for (let i = 0; i < input.length; i += 4)
					if (
						input[i + 3] === 255 &&
						[0, 1, 2, 3].some((c) => input[i + c] !== output[i + c])
					)
						opaqueWrong++;
				const comparison = await compareNativePixels(reference, actual);
				results.push({
					name: variant.name,
					wrong: comparison.mismatchedPixels,
					opaqueWrong,
					max: comparison.maxChannelDelta,
					error: null,
					samples: colors.map((_, i) =>
						Array.from(
							output.subarray(
								(8 * 64 + i * 8 + 4) * 4,
								(8 * 64 + i * 8 + 4) * 4 + 4,
							),
						),
					),
				});
				const bytes = new Uint8Array(await actual.arrayBuffer());
				let png = '';
				for (const byte of bytes) png += String.fromCharCode(byte);
				await server.commands.writeFile(
					directory + '/' + variant.name + '.png',
					btoa(png),
					'base64',
				);
			} catch (error) {
				results.push({
					name: variant.name,
					wrong: null,
					opaqueWrong: null,
					max: null,
					error: String(error),
					samples: null,
				});
			} finally {
				await server.commands.writeFile(
					directory + '/' + variant.name + '.svg',
					new XMLSerializer().serializeToString(svg),
				);
				canvas.width = 0;
				canvas.height = 0;
			}
		}

		await server.commands.writeFile(
			directory + '/reference.png',
			btoa(binary),
			'base64',
		);
		await server.commands.writeFile(
			directory + '/comparison.json',
			JSON.stringify(
				{
					browser: server.browser,
					platform: server.platform,
					devicePixelRatio,
					userAgent: navigator.userAgent,
					width: 64,
					height: 32,
					results,
				},
				null,
				2,
			),
		);
		for (const result of results) {
			expect(result.error, result.name).toBeNull();
			expect(result.wrong, result.name).toBe(0);
		}
	} finally {
		source.width = 0;
		source.height = 0;
	}
});
