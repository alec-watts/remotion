import '../symbol-dispose';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import {projectiveFilterInput} from './fixtures/projective-filter-input';
import {captureNativeReference, countNativePixels} from './native-reference';

const markupFromHost = (host: HTMLElement) => {
	const wrapper = host.querySelector<HTMLElement>('[data-glyph-source]');
	if (!wrapper) throw new Error('Missing glyph markup');
	const copy = wrapper.cloneNode(true) as HTMLElement;
	const style = getComputedStyle(wrapper);
	copy.style.fontFamily = style.fontFamily;
	copy.style.fontSize = style.fontSize;
	copy.style.fontWeight = style.fontWeight;
	copy.style.fontStyle = style.fontStyle;
	copy.style.lineHeight = style.lineHeight;
	copy.style.direction = style.direction;
	copy.style.color = style.color;
	const targets = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
	for (const [index, element] of [
		wrapper,
		...wrapper.querySelectorAll('*'),
	].entries()) {
		const target = targets[index]!;
		target.style.boxSizing = getComputedStyle(element).boxSizing;
	}

	return copy;
};

const renderMarkup = async (markup: HTMLElement, size: number) => {
	const namespace = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(namespace, 'svg');
	const foreignObject = document.createElementNS(namespace, 'foreignObject');
	for (const element of [svg, foreignObject]) {
		element.setAttribute('width', String(size));
		element.setAttribute('height', String(size));
	}

	foreignObject.appendChild(markup);
	svg.appendChild(foreignObject);
	Object.assign(svg.style, {position: 'absolute', left: '-10000px', top: '0'});
	const canvas = new OffscreenCanvas(size, size);
	try {
		document.body.appendChild(svg);
		const image = await turnSvgIntoDrawable(svg);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Missing SVG replay canvas context');
		context.fillStyle = 'white';
		context.fillRect(0, 0, size, size);
		context.drawImage(image, 0, 0);
		return await canvas.convertToBlob({type: 'image/png'});
	} finally {
		svg.remove();
		canvas.width = 0;
		canvas.height = 0;
	}
};

test.for(
	[false, true].flatMap((preserving) =>
		[1, 1.5].flatMap((scale) => [
			{preserving, scale, horizontalScale: 1, mixedMarkup: undefined},
			{preserving, scale, horizontalScale: 2, mixedMarkup: undefined},
			...(['textured', 'rounded-clip', 'masked'] as const).map(
				(mixedMarkup) => ({
					preserving,
					scale,
					horizontalScale: 2,
					mixedMarkup,
				}),
			),
		]),
	),
)(
	'compares text and shadow at preserving=$preserving scale=$scale horizontalScale=$horizontalScale mixedMarkup=$mixedMarkup',
	async ({preserving, scale, horizontalScale, mixedMarkup}) => {
		const geometry = {
			transform: horizontalScale === 1 ? 'none' : 'scaleX(2)',
			mixedMarkup,
		};
		const filtered = projectiveFilterInput(
			'text-visible',
			preserving,
			null,
			geometry,
		);
		const source = projectiveFilterInput('text-visible', preserving, null, {
			...geometry,
			paint: 'source-only',
		});
		const layered = projectiveFilterInput('text-visible', preserving, null, {
			...geometry,
			paint: 'source-only',
			willChange: 'transform',
		});
		const shifted = projectiveFilterInput(
			'text-visible',
			preserving,
			{left: 25 + 60 * horizontalScale, top: 100, shadowOffset: 60},
			{...geometry, mixedMarkup: undefined, paint: 'blue-text'},
		);
		const split = (
			order: 'transform-outside' | 'filter-outside',
			paint: 'filtered' | 'source-only',
		) =>
			projectiveFilterInput(
				'text-visible',
				preserving,
				{
					left: 25,
					top: 100,
					// An outer filter's shadow offset is already in the scaled coordinates.
					shadowOffset: order === 'filter-outside' ? 60 * horizontalScale : 60,
				},
				{...geometry, order, paint},
			);
		const native = (
			composition: typeof filtered,
			onBeforeCapture?: (host: HTMLElement) => void,
		) => {
			const Scene = composition.component;
			return captureNativeReference(
				{
					...composition,
					width: composition.width * scale,
					height: composition.height * scale,
					component: () => (
						<div
							data-glyph-source
							style={{
								position: 'absolute',
								width: composition.width,
								height: composition.height,
								transform: `scale(${scale})`,
								transformOrigin: '0 0',
							}}
						>
							<Scene />
						</div>
					),
				},
				0,
				{omitBackground: false, onBeforeCapture},
			);
		};

		const render = async (composition: typeof filtered) =>
			(
				await renderStillOnWeb({
					composition,
					frame: 0,
					licenseKey: 'free-license',
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering: true,
					scale,
				})
			).blob({format: 'png'});
		let filteredMarkup: HTMLElement | null = null;
		let sourceMarkup: HTMLElement | null = null;
		const nativeFiltered = await native(filtered, (host) => {
			filteredMarkup = markupFromHost(host);
		});
		const actualFiltered = await render(filtered);
		const nativeSource = await native(source, (host) => {
			sourceMarkup = markupFromHost(host);
		});
		const actualSource = await render(source);
		const nativeShifted = await native(shifted);
		const nativeLayered = await native(layered);
		const transformOutside = split('transform-outside', 'filtered');
		const filterOutside = split('filter-outside', 'filtered');
		const nativeTransformOutside = await native(transformOutside);
		const actualTransformOutside = await render(transformOutside);
		const nativeFilterOutside = await native(filterOutside);
		const actualFilterOutside = await render(filterOutside);
		const nativeTransformOutsideSource = await native(
			split('transform-outside', 'source-only'),
		);
		const nativeFilterOutsideSource = await native(
			split('filter-outside', 'source-only'),
		);
		if (!filteredMarkup || !sourceMarkup)
			throw new Error('Missing copied glyph markup');
		const [svgFiltered, svgSource] = await Promise.allSettled([
			renderMarkup(filteredMarkup, filtered.width * scale),
			renderMarkup(sourceMarkup, source.width * scale),
		]);

		const folder = `test/__results__/text-shadow-source/${server.browser}/${preserving}/${scale}/${horizontalScale}${mixedMarkup ? `/${mixedMarkup}` : ''}`;
		await server.commands.writeFile(
			`${folder}/svg-replay.json`,
			JSON.stringify(
				[svgFiltered, svgSource].map((result) =>
					result.status === 'fulfilled' ? null : String(result.reason),
				),
			),
		);
		for (const [name, blob] of Object.entries({
			nativeFiltered,
			actualFiltered,
			nativeSource,
			actualSource,
			nativeShifted,
			nativeLayered,
			nativeTransformOutside,
			actualTransformOutside,
			nativeFilterOutside,
			actualFilterOutside,
			nativeTransformOutsideSource,
			nativeFilterOutsideSource,
			svgFiltered:
				svgFiltered.status === 'fulfilled' ? svgFiltered.value : null,
			svgSource: svgSource.status === 'fulfilled' ? svgSource.value : null,
		})) {
			if (!blob) continue;
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		expect
			.soft(
				(await countNativePixels(nativeFiltered, actualFiltered))
					.mismatchedPixels,
			)
			.toBe(0);
		expect
			.soft(
				(await countNativePixels(nativeSource, actualSource)).mismatchedPixels,
			)
			.toBe(0);
		expect
			.soft(
				(
					await countNativePixels(
						nativeTransformOutside,
						actualTransformOutside,
					)
				).mismatchedPixels,
			)
			.toBe(0);
		expect
			.soft(
				(await countNativePixels(nativeFilterOutside, actualFilterOutside))
					.mismatchedPixels,
			)
			.toBe(0);
		for (const [expected, replay] of [
			[nativeFiltered, svgFiltered],
			[nativeSource, svgSource],
		] as const) {
			if (replay.status === 'rejected') {
				expect.soft(String(replay.reason)).toBeNull();
			} else {
				expect
					.soft(
						(await countNativePixels(expected, replay.value)).mismatchedPixels,
					)
					.toBe(0);
			}
		}
	},
);
