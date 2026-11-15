import {useEffect, useState} from 'react';
import {AbsoluteFill, useDelayRender} from 'remotion';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {captureNativeReference, compareNativePixels} from './native-reference';

const makeSource = async () => {
	const canvas = new OffscreenCanvas(64, 32);
	try {
		const context = canvas.getContext('2d')!;
		for (const [index, color] of [
			'rgb(40,80,160)',
			'rgb(130,70,90)',
			'rgb(17,115,171)',
			'rgb(220,60,20)',
			'black',
			'white',
			'rgba(40,80,160,0.5)',
			'rgba(220,60,20,0.5)',
		].entries()) {
			context.fillStyle = color;
			context.fillRect(index * 8, 0, 8, 32);
		}

		const blob = await canvas.convertToBlob({type: 'image/png'});
		let bytes = '';
		for (const byte of new Uint8Array(await blob.arrayBuffer()))
			bytes += String.fromCharCode(byte);
		return {binary: bytes, url: 'data:image/png;base64,' + btoa(bytes)};
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
};

const functions = [
	'none',
	'blur(2px)',
	'brightness(1.3)',
	'contrast(140%)',
	'drop-shadow(3px 2px 0px rgb(0,100,200))',
	'grayscale(75%)',
	'hue-rotate(90deg)',
	'invert(30%)',
	'opacity(50%)',
	'saturate(1.5)',
	'sepia(60%)',
	'blur(2px) brightness(1.2) contrast(150%)',
];
for (const [index, filter] of functions.entries()) {
	test(`native CSS image backend ${index} ${filter}`, async () => {
		const source = await makeSource();
		const Component = () => {
			const {delayRender, continueRender, cancelRender} = useDelayRender();
			const [handle] = useState(() =>
				delayRender('Loading native color pattern'),
			);
			useEffect(() => () => continueRender(handle), [continueRender, handle]);
			return (
				<AbsoluteFill style={{backgroundColor: 'white'}}>
					<img
						src={source.url}
						style={{width: 64, height: 32, filter}}
						onLoad={() => continueRender(handle)}
						onError={() =>
							cancelRender(new Error('Native pattern image failed'))
						}
					/>
				</AbsoluteFill>
			);
		};

		const reference = await captureNativeReference(
			{
				component: Component,
				id: 'css-image-color-' + index,
				width: 64,
				height: 32,
				fps: 30,
				durationInFrames: 1,
			},
			0,
			{omitBackground: false},
		);
		const directory =
			'test/__results__/svg-css-filter-stages/' + server.browser + '/' + index;
		let referenceBytes = '';
		for (const byte of new Uint8Array(await reference.arrayBuffer()))
			referenceBytes += String.fromCharCode(byte);
		await server.commands.writeFile(
			directory + '/reference.png',
			btoa(referenceBytes),
			'base64',
		);
		await server.commands.writeFile(
			directory + '/source.png',
			btoa(source.binary),
			'base64',
		);
		const results: {
			target: string;
			wrong: number | null;
			max: number | null;
			error: string | null;
		}[] = [];
		for (const target of [
			'root',
			'group',
			'image',
			'html-image',
			'html-group',
		]) {
			const canvas = new OffscreenCanvas(64, 32);
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('width', '64');
			svg.setAttribute('height', '32');
			const image = document.createElementNS(svg.namespaceURI, 'image');
			image.setAttribute('href', source.url);
			image.setAttribute('width', '64');
			image.setAttribute('height', '32');
			if (target === 'root') {
				svg.setAttribute('style', 'filter:' + filter);
				svg.appendChild(image);
			} else if (target === 'group') {
				const group = document.createElementNS(svg.namespaceURI, 'g');
				group.setAttribute('style', 'filter:' + filter);
				group.appendChild(image);
				svg.appendChild(group);
			} else if (target === 'image') {
				image.setAttribute('style', 'filter:' + filter);
				svg.appendChild(image);
			} else {
				const foreignObject = document.createElementNS(
					svg.namespaceURI,
					'foreignObject',
				);
				foreignObject.setAttribute('width', '64');
				foreignObject.setAttribute('height', '32');
				const html = document.createElementNS(
					'http://www.w3.org/1999/xhtml',
					'div',
				);
				html.setAttribute('style', 'width:64px;height:32px;line-height:0');
				const htmlImage = document.createElementNS(
					'http://www.w3.org/1999/xhtml',
					'img',
				);
				htmlImage.setAttribute('src', source.url);
				htmlImage.setAttribute('style', 'display:block;width:64px;height:32px');

				if (target === 'html-image') {
					htmlImage.setAttribute(
						'style',
						'display:block;width:64px;height:32px;filter:' + filter,
					);
				} else {
					html.setAttribute(
						'style',
						'width:64px;height:32px;line-height:0;filter:' + filter,
					);
				}

				html.appendChild(htmlImage);
				foreignObject.appendChild(html);
				svg.appendChild(foreignObject);
			}

			try {
				const context = canvas.getContext('2d')!;
				context.fillStyle = 'white';
				context.fillRect(0, 0, 64, 32);
				context.drawImage(await turnSvgIntoDrawable(svg), 0, 0);
				const actual = await canvas.convertToBlob({type: 'image/png'});
				const comparison = await compareNativePixels(reference, actual);
				results.push({
					target,
					wrong: comparison.mismatchedPixels,
					max: comparison.maxChannelDelta,
					error: null,
				});
				let bytes = '';
				for (const byte of new Uint8Array(await actual.arrayBuffer()))
					bytes += String.fromCharCode(byte);
				await server.commands.writeFile(
					directory + '/' + target + '.png',
					btoa(bytes),
					'base64',
				);
			} catch (error) {
				results.push({target, wrong: null, max: null, error: String(error)});
			} finally {
				await server.commands.writeFile(
					directory + '/' + target + '.svg',
					new XMLSerializer().serializeToString(svg),
				);
				canvas.width = 0;
				canvas.height = 0;
			}
		}

		await server.commands.writeFile(
			directory + '/comparison.json',
			JSON.stringify(
				{
					browser: server.browser,
					platform: server.platform,
					devicePixelRatio,
					userAgent: navigator.userAgent,
					index,
					filter,
					width: 64,
					height: 32,
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
