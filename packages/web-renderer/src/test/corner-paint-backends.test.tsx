import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {parseBorderRadius} from '../drawing/border-radius';
import {drawRoundedRectPath} from '../drawing/draw-rounded';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	boxShadowSpreadInset,
	boxShadowSpreadInsetAlpha,
	boxShadowInsetReview,
	boxShadowInsetContentClip,
	boxShadowInsetFractional,
} from './fixtures/box-shadow-spread-inset';
import {captureNativeReference, compareNativePixels} from './native-reference';

const cases = [
	{id: 'zero', radius: '0px', left: 20, top: 20, scale: 1, color: 'blue'},
	{id: 'rounded', radius: '4px', left: 20, top: 20, scale: 1, color: 'blue'},
	{
		id: 'fractional',
		radius: '4px',
		left: 20.25,
		top: 20.5,
		scale: 1,
		color: 'blue',
	},
	{id: 'pill', radius: '999px', left: 20, top: 20, scale: 1, color: 'blue'},
	{
		id: 'ellipse',
		radius: '24px / 12px',
		left: 20,
		top: 20,
		scale: 1,
		color: 'blue',
	},
	{
		id: 'asymmetric',
		radius: '4px 12px 20px 8px / 8px 20px 12px 4px',
		left: 20,
		top: 20,
		scale: 1,
		color: 'blue',
	},
	{id: 'scaled', radius: '4px', left: 20, top: 20, scale: 2, color: 'blue'},
	{
		id: 'alpha',
		radius: '4px',
		left: 20,
		top: 20,
		scale: 1,
		color: 'rgba(0,0,255,0.5)',
	},
] as const;

for (const sample of cases) {
	test('native rounded paint backend ' + sample.id, async () => {
		const width = 100;
		const height = 80;
		const style: CSSProperties = {
			position: 'absolute',
			left: sample.left,
			top: sample.top,
			width,
			height,
			borderRadius: sample.radius,
			backgroundColor: sample.color,
			transform: 'scale(' + sample.scale + ')',
			transformOrigin: '0 0',
		};
		const Component = () => (
			<AbsoluteFill style={{backgroundColor: 'white'}}>
				<div style={style} />
			</AbsoluteFill>
		);
		const composition = {
			component: Component,
			id: 'rounded-backend-' + sample.id,
			width: 320,
			height: 200,
			fps: 30,
			durationInFrames: 1,
		};
		const reference = await captureNativeReference(composition, 0, {
			omitBackground: false,
		});
		const directory =
			'test/__results__/corner-paint/' + server.browser + '/' + sample.id;
		const outputs: {name: string; blob: Blob}[] = [
			{name: 'reference', blob: reference},
		];
		const results: {
			target: string;
			wrong: number | null;
			max: number | null;
			error: string | null;
		}[] = [];
		const radius = parseBorderRadius({
			borderRadius: sample.radius,
			width,
			height,
		});
		for (const target of [
			'renderer',
			'producer-clip',
			'producer-clip-cover',
			'producer-fill',
			'roundrect-clip',
			'roundrect-clip-cover',
			'roundrect-fill',
			'html-svg',
		]) {
			let canvas: OffscreenCanvas | null = null;
			try {
				let actual: Blob;
				if (target === 'renderer') {
					actual = await (
						await renderStillOnWeb({
							licenseKey: 'free-license',
							composition,
							frame: 0,
							inputProps: {},
							allowHtmlInCanvas: false,
						})
					).blob({format: 'png'});
				} else {
					canvas = new OffscreenCanvas(composition.width, composition.height);
					const context = canvas.getContext('2d')!;
					context.fillStyle = 'white';
					context.fillRect(0, 0, composition.width, composition.height);
					if (target === 'html-svg') {
						const svg = document.createElementNS(
							'http://www.w3.org/2000/svg',
							'svg',
						);
						svg.setAttribute('width', String(composition.width));
						svg.setAttribute('height', String(composition.height));
						const foreignObject = document.createElementNS(
							svg.namespaceURI,
							'foreignObject',
						);
						foreignObject.setAttribute('width', String(composition.width));
						foreignObject.setAttribute('height', String(composition.height));
						const host = document.createElement('div');
						host.setAttribute(
							'style',
							'position:relative;width:320px;height:200px',
						);
						const box = document.createElement('div');
						box.setAttribute(
							'style',
							'position:absolute;left:' +
								sample.left +
								'px;top:' +
								sample.top +
								'px;width:100px;height:80px;border-radius:' +
								sample.radius +
								';background-color:' +
								sample.color +
								';transform:scale(' +
								sample.scale +
								');transform-origin:0 0',
						);
						host.appendChild(box);
						foreignObject.appendChild(host);
						svg.appendChild(foreignObject);
						context.drawImage(await turnSvgIntoDrawable(svg), 0, 0);
						await server.commands.writeFile(
							directory + '/' + target + '.svg',
							new XMLSerializer().serializeToString(svg),
						);
					} else {
						context.translate(sample.left, sample.top);
						context.scale(sample.scale, sample.scale);
						context.fillStyle = sample.color;
						if (
							target === 'producer-clip' ||
							target === 'producer-clip-cover' ||
							target === 'producer-fill'
						) {
							drawRoundedRectPath({
								ctx: context,
								x: 0,
								y: 0,
								width,
								height,
								borderRadius: radius,
							});
							if (
								target === 'producer-clip' ||
								target === 'producer-clip-cover'
							) {
								context.clip();
								if (target.endsWith('-cover')) {
									context.fillRect(-1, -1, width + 2, height + 2);
								} else {
									context.fillRect(0, 0, width, height);
								}
							} else {
								context.fill();
							}
						} else {
							context.beginPath();
							context.roundRect(
								0,
								0,
								width,
								height,
								[
									radius.topLeft,
									radius.topRight,
									radius.bottomRight,
									radius.bottomLeft,
								].map((r) => ({x: r.horizontal, y: r.vertical})),
							);
							if (
								target === 'roundrect-clip' ||
								target === 'roundrect-clip-cover'
							) {
								context.clip();
								if (target.endsWith('-cover')) {
									context.fillRect(-1, -1, width + 2, height + 2);
								} else {
									context.fillRect(0, 0, width, height);
								}
							} else {
								context.fill();
							}
						}
					}

					actual = await canvas.convertToBlob({type: 'image/png'});
				}

				const comparison = await compareNativePixels(reference, actual);
				outputs.push(
					{name: target, blob: actual},
					{name: target + '-diff', blob: comparison.diff},
				);
				results.push({
					target,
					wrong: comparison.mismatchedPixels,
					max: comparison.maxChannelDelta,
					error: null,
				});
			} catch (error) {
				results.push({target, wrong: null, max: null, error: String(error)});
			} finally {
				if (canvas) {
					canvas.width = 0;
					canvas.height = 0;
				}
			}
		}

		for (const output of outputs) {
			let binary = '';
			for (const byte of new Uint8Array(await output.blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				directory + '/' + output.name + '.png',
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(
			directory + '/comparison.json',
			JSON.stringify(
				{
					browser: server.browser,
					platform: server.platform,
					userAgent: navigator.userAgent,
					devicePixelRatio,
					sample,
					width: composition.width,
					height: composition.height,
					results,
				},
				null,
				2,
			),
		);
		for (const result of results) {
			expect(result.error, result.target).toBeNull();
			expect(result.wrong, result.target).toBe(0);
		}
	});
}

const roundedShadows = [
	{radius: '4px', shadow: '4px 6px 0 8px blue', background: '#eee'},
	{
		radius: '999px',
		shadow: '-4px 6px 6px rgba(0,0,255,.5)',
		background: '#eee',
	},
	{radius: '24px / 12px', shadow: '-4px -6px 0 -2px blue', background: '#eee'},
	{
		radius: '4px 12px 20px 8px / 8px 20px 12px 4px',
		shadow: '6px 4px 8px 4px blue',
		background: 'rgba(240,240,240,.5)',
	},
];
const RoundedShadowComponent = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{backgroundColor: 'white'}}>
			{roundedShadows.map((sample, index) => (
				<div
					key={sample.radius}
					style={{
						position: 'absolute',
						left: 30 + (index % 2) * 160 + frame * 4,
						top: 30 + Math.floor(index / 2) * 130,
						width: 100,
						height: 80,
						borderRadius: sample.radius,
						boxShadow: sample.shadow,
						backgroundColor: sample.background,
					}}
				/>
			))}
		</AbsoluteFill>
	);
};

const roundedShadowComposition = {
	component: RoundedShadowComponent,
	id: 'rounded-shadow-interactions',
	width: 360,
	height: 280,
	fps: 30,
	durationInFrames: 2,
};

for (const composition of [
	roundedShadowComposition,
	boxShadowSpreadInset,
	boxShadowSpreadInsetAlpha,
	boxShadowInsetReview,
	boxShadowInsetContentClip,
	boxShadowInsetFractional,
]) {
	for (const frame of [0, 1]) {
		test(
			'native shadow interaction ' + composition.id + ' frame ' + frame,
			async () => {
				const reference = await captureNativeReference(composition, frame, {
					omitBackground: composition.id === boxShadowSpreadInsetAlpha.id,
				});
				const actual = await (
					await renderStillOnWeb({
						licenseKey: 'free-license',
						composition,
						frame,
						inputProps: {},
						allowHtmlInCanvas: false,
					})
				).blob({format: 'png'});
				const comparison = await compareNativePixels(reference, actual);
				const directory =
					'test/__results__/corner-shadow-interactions/' +
					server.browser +
					'/' +
					composition.id +
					'-' +
					frame;
				for (const [name, blob] of [
					['reference', reference],
					['actual', actual],
					['diff', comparison.diff],
				] as const) {
					let binary = '';
					for (const byte of new Uint8Array(await blob.arrayBuffer()))
						binary += String.fromCharCode(byte);
					await server.commands.writeFile(
						directory + '/' + name + '.png',
						btoa(binary),
						'base64',
					);
				}

				await server.commands.writeFile(
					directory + '/comparison.json',
					JSON.stringify(
						{
							browser: server.browser,
							platform: server.platform,
							userAgent: navigator.userAgent,
							devicePixelRatio,
							id: composition.id,
							frame,
							width: composition.width,
							height: composition.height,
							mismatchedPixels: comparison.mismatchedPixels,
							maxChannelDelta: comparison.maxChannelDelta,
						},
						null,
						2,
					),
				);
				expect(comparison.mismatchedPixels).toBe(0);
			},
		);
	}
}
