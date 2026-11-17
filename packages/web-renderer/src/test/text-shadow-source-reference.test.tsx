import '../symbol-dispose';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {setMaskStageObserver} from '../drawing/mask-stage-trace';
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

const writePng = async (path: string, blob: Blob) => {
	let binary = '';
	for (const byte of new Uint8Array(await blob.arrayBuffer())) {
		binary += String.fromCharCode(byte);
	}

	await server.commands.writeFile(path, btoa(binary), 'base64');
};

test.for(
	[false, true].flatMap((preserving) =>
		[1, 1.5].flatMap((scale) => [
			{
				preserving,
				scale,
				horizontalScale: 1,
				mixedMarkup: undefined,
				rotationY: 0,
			},
			{
				preserving,
				scale,
				horizontalScale: 2,
				mixedMarkup: undefined,
				rotationY: 0,
			},
			...(['textured', 'rounded-clip', 'masked'] as const).map(
				(mixedMarkup) => ({
					preserving,
					scale,
					horizontalScale: 2,
					rotationY: 0,
					mixedMarkup,
				}),
			),
			{
				preserving,
				scale,
				horizontalScale: 2,
				rotationY: 24,
				mixedMarkup: 'masked' as const,
			},
		]),
	),
)(
	'compares text and shadow at preserving=$preserving scale=$scale horizontalScale=$horizontalScale mixedMarkup=$mixedMarkup rotationY=$rotationY',
	async ({preserving, scale, horizontalScale, mixedMarkup, rotationY}) => {
		const geometry = {
			transform: rotationY
				? `rotateY(${rotationY}deg) scaleX(${horizontalScale})`
				: horizontalScale === 1
					? 'none'
					: 'scaleX(2)',
			perspective: rotationY ? 400 : undefined,
			mixedMarkup,
		};
		const folder = `test/__results__/text-shadow-source/${server.browser}/${preserving}/${scale}/${horizontalScale}${mixedMarkup ? `/${mixedMarkup}` : ''}${rotationY ? '/perspective' : ''}`;
		const stageComparisons: {name: string; mismatchedPixels: number | null}[] =
			[];
		const shouldTrace = mixedMarkup === 'masked' || mixedMarkup === 'textured';

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

		const render = async (
			composition: typeof filtered,
		): Promise<PromiseSettledResult<Blob>> => {
			try {
				const still = await renderStillOnWeb({
					composition,
					frame: 0,
					licenseKey: 'free-license',
					inputProps: {},
					allowHtmlInCanvas: false,
					experimental3DRendering: true,
					scale,
				});
				return {status: 'fulfilled', value: await still.blob({format: 'png'})};
			} catch (reason) {
				return {status: 'rejected', reason};
			}
		};

		const renderWithTrace = async (
			name: string,
			composition: typeof filtered,
		): Promise<PromiseSettledResult<Blob>> => {
			if (!shouldTrace) {
				return render(composition);
			}

			type Sample = Parameters<
				NonNullable<Parameters<typeof setMaskStageObserver>[0]>
			>[0];
			const samples: Sample[] = [];
			setMaskStageObserver((sample) => samples.push(sample));
			let traced: PromiseSettledResult<Blob>;
			try {
				traced = await render(composition);
			} finally {
				setMaskStageObserver(null);
			}

			const manifest = await Promise.all(
				samples.map(async ({png, ...sample}, index) => {
					const file = `${index}-${sample.target}-${sample.stage}.png`;
					try {
						await writePng(`${folder}/stages/${name}/${file}`, await png);
						return {...sample, file};
					} catch (error) {
						return {...sample, error: String(error)};
					}
				}),
			);
			await server.commands.writeFile(
				`${folder}/stages/${name}/stages.json`,
				JSON.stringify(manifest),
			);

			const control = await render(composition);
			const diff =
				traced.status === 'fulfilled' && control.status === 'fulfilled'
					? (await countNativePixels(control.value, traced.value))
							.mismatchedPixels
					: null;
			if (diff !== 0 && control.status === 'fulfilled') {
				await writePng(`${folder}/stages/${name}/trace-off.png`, control.value);
			}

			stageComparisons.push({name, mismatchedPixels: diff});
			return traced;
		};

		let filteredMarkup: HTMLElement | null = null;
		let sourceMarkup: HTMLElement | null = null;
		const nativeFiltered = await native(filtered, (host) => {
			filteredMarkup = markupFromHost(host);
		});
		const actualFiltered = await renderWithTrace('actualFiltered', filtered);
		const nativeSource = await native(source, (host) => {
			sourceMarkup = markupFromHost(host);
		});
		const actualSource = await renderWithTrace('actualSource', source);
		const nativeShifted = await native(shifted);
		const nativeLayered = await native(layered);
		const transformOutside = split('transform-outside', 'filtered');
		const filterOutside = split('filter-outside', 'filtered');
		const nativeTransformOutside = await native(transformOutside);
		const actualTransformOutside = await renderWithTrace(
			'actualTransformOutside',
			transformOutside,
		);
		const nativeFilterOutside = await native(filterOutside);
		const actualFilterOutside = await renderWithTrace(
			'actualFilterOutside',
			filterOutside,
		);
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

		const exportResults = {
			actualFiltered,
			actualSource,
			actualTransformOutside,
			actualFilterOutside,
		};
		const errorText = (result: PromiseSettledResult<Blob>) =>
			result.status === 'fulfilled' ? null : String(result.reason);
		await server.commands.writeFile(
			`${folder}/export-replay.json`,
			JSON.stringify(
				Object.fromEntries(
					Object.entries(exportResults).map(([name, result]) => [
						name,
						errorText(result),
					]),
				),
			),
		);
		await server.commands.writeFile(
			`${folder}/svg-replay.json`,
			JSON.stringify([svgFiltered, svgSource].map(errorText)),
		);
		for (const [name, blob] of Object.entries({
			nativeFiltered,
			nativeSource,
			nativeShifted,
			nativeLayered,
			nativeTransformOutside,
			nativeFilterOutside,
			nativeTransformOutsideSource,
			nativeFilterOutsideSource,
			...Object.fromEntries(
				Object.entries({...exportResults, svgFiltered, svgSource}).flatMap(
					([captureName, capture]) =>
						capture.status === 'fulfilled'
							? [[captureName, capture.value]]
							: [],
				),
			),
		})) {
			await writePng(`${folder}/${name}.png`, blob);
		}

		if (shouldTrace) {
			await server.commands.writeFile(
				`${folder}/stages/comparisons.json`,
				JSON.stringify(stageComparisons),
			);
			for (const {name, mismatchedPixels} of stageComparisons) {
				expect.soft(mismatchedPixels, `trace on versus off: ${name}`).toBe(0);
			}
		}

		for (const [name, expected, capture] of [
			['filtered export', nativeFiltered, actualFiltered],
			['unfiltered export', nativeSource, actualSource],
			[
				'outer transform export',
				nativeTransformOutside,
				actualTransformOutside,
			],
			['outer filter export', nativeFilterOutside, actualFilterOutside],
			['filtered SVG replay', nativeFiltered, svgFiltered],
			['unfiltered SVG replay', nativeSource, svgSource],
		] as const) {
			if (capture.status === 'rejected') {
				expect.soft(errorText(capture), name).toBeNull();
			} else {
				expect
					.soft(
						(await countNativePixels(expected, capture.value)).mismatchedPixels,
						name,
					)
					.toBe(0);
			}
		}
	},
);
