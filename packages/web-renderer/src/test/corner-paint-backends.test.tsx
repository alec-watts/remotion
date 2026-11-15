import type {CSSProperties} from 'react';
import {AbsoluteFill} from 'remotion';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {parseBorderRadius} from '../drawing/border-radius';
import {drawRoundedRectPath} from '../drawing/draw-rounded';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
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
			'ellipse-clip',
			'roundrect-clip',
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
						if (target === 'ellipse-clip') {
							drawRoundedRectPath({
								ctx: context,
								x: 0,
								y: 0,
								width,
								height,
								borderRadius: radius,
							});
							context.clip();
							context.fillRect(0, 0, width, height);
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
							if (target === 'roundrect-clip') {
								context.clip();
								context.fillRect(0, 0, width, height);
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
