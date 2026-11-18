import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {maskCopyOffsets, maskCopyOverflow} from './fixtures/mask-copy-overflow';
import {captureNativeReference, countNativePixels} from './native-reference';

const paintProperties = [
	'background-color',
	'background-image',
	'background-position',
	'background-size',
	'background-repeat',
	'background-origin',
	'background-clip',
	'border-radius',
	'overflow',
] as const;

test.for([
	...(['hard', 'soft', 'fractional', 'translucent'] as const).flatMap((mode) =>
		(['hidden', 'visible'] as const).flatMap((overflow) =>
			[1, 1.25, 2, 2.5].flatMap((scale) =>
				[0, 1].map((frame) => ({
					mode,
					overflow,
					scale,
					frame,
					position: null as {left: number; top: number} | null,
					label: '',
				})),
			),
		),
	),
	...[1.75, 2.5].flatMap((scale) =>
		maskCopyOffsets.map((position) => ({
			mode: 'fractional' as const,
			overflow: 'visible' as const,
			scale,
			frame: 0,
			position,
			label: ` offset=${position.left},${position.top}`,
		})),
	),
])(
	'compares joint paint $mode $overflow scale=$scale frame=$frame$label',
	async ({mode, overflow, scale, frame, position}) => {
		const fixture = maskCopyOverflow({mode, overflow, position});
		const Source = fixture.component;
		const composition = {
			...fixture,
			component: () => (
				<div data-joint-mask-root="" style={{position: 'absolute', inset: 0}}>
					<Source />
				</div>
			),
		};
		const Component = composition.component;
		const reference = await captureNativeReference(
			{
				...composition,
				width: composition.width * scale,
				height: composition.height * scale,
				component: () => (
					<div style={{transform: `scale(${scale})`, transformOrigin: '0 0'}}>
						<Component />
					</div>
				),
			},
			frame,
			{omitBackground: mode !== 'hard'},
		);
		const captures: {svg: string; styles: [string, string][]}[] = [];
		const serialize = XMLSerializer.prototype.serializeToString;
		const observer = vi
			.spyOn(XMLSerializer.prototype, 'serializeToString')
			.mockImplementation(function (this: XMLSerializer, node: Node) {
				const svg = serialize.call(this, node);
				if (
					node instanceof SVGSVGElement &&
					node.querySelector('foreignObject')
				) {
					const source = document.querySelector('[data-joint-mask-root] > div');
					if (!source) throw new Error('Missing connected masked source');
					const style = getComputedStyle(source);
					captures.push({
						svg,
						styles: paintProperties.map((property) => [
							property,
							style.getPropertyValue(property),
						]),
					});
				}

				return svg;
			});
		let actual: Blob;
		try {
			actual = await (
				await renderStillOnWeb({
					licenseKey: 'free-license',
					composition,
					frame,
					scale,
					inputProps: {},
					allowHtmlInCanvas: false,
				})
			).blob({format: 'png'});
		} finally {
			observer.mockRestore();
		}

		expect(captures).toHaveLength(1);
		const captured = captures[0];
		const parsed = new DOMParser().parseFromString(
			captured.svg,
			'image/svg+xml',
		);
		const target = parsed.querySelector<HTMLElement>(
			'foreignObject > div > div',
		);
		if (!target) throw new Error('Missing serialized mask target');
		const captureLeft =
			(position?.left ?? (mode === 'fractional' ? 0.25 : 0)) -
			parseFloat(target.style.left);
		const captureTop = (position?.top ?? 0) - parseFloat(target.style.top);
		target.replaceChildren();
		for (const [property, value] of captured.styles) {
			target.style.setProperty(property, value);
		}

		const jointSvg = new XMLSerializer().serializeToString(
			parsed.documentElement,
		);
		const toDeviceCarrier = (markup: string) => {
			const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
			const svg = document.documentElement;
			const viewBox = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
			const width = Number(svg.getAttribute('width'));
			const height = Number(svg.getAttribute('height'));
			const foreignObject = svg.querySelector('foreignObject')!;
			const viewport = foreignObject.firstElementChild as HTMLElement;
			svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
			foreignObject.setAttribute('width', String(width));
			foreignObject.setAttribute('height', String(height));
			viewport.style.transformOrigin = '0 0';
			viewport.style.transform = `scale(${width / viewBox[2]}, ${height / viewBox[3]})`;
			return new XMLSerializer().serializeToString(svg);
		};

		const bitmapDeviceSvg = toDeviceCarrier(captured.svg);
		const jointDeviceSvg = toDeviceCarrier(jointSvg);
		const toPhaseAlignedCarrier = (markup: string) => {
			const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
			const svg = document.documentElement;
			const viewBox = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
			const left = Math.floor(captureLeft * scale);
			const top = Math.floor(captureTop * scale);
			const width = Math.ceil((captureLeft + viewBox[2]) * scale) - left;
			const height = Math.ceil((captureTop + viewBox[3]) * scale) - top;
			const foreignObject = svg.querySelector('foreignObject')!;
			const viewport = foreignObject.firstElementChild as HTMLElement;
			const maskTarget = viewport.firstElementChild as HTMLElement;
			svg.setAttribute('width', String(width));
			svg.setAttribute('height', String(height));
			svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
			foreignObject.setAttribute('width', String(width));
			foreignObject.setAttribute('height', String(height));
			maskTarget.style.left = `${position?.left ?? (mode === 'fractional' ? 0.25 : 0)}px`;
			maskTarget.style.top = `${position?.top ?? 0}px`;
			viewport.style.transformOrigin = '0 0';
			viewport.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${-left}, ${-top})`;
			return {
				svg: new XMLSerializer().serializeToString(svg),
				left,
				top,
				width,
				height,
			};
		};

		const bitmapPhaseSvg = toPhaseAlignedCarrier(captured.svg);
		const jointPhaseSvg = toPhaseAlignedCarrier(jointSvg);
		const replay = async (
			svg: string,
			left = captureLeft * scale,
			top = captureTop * scale,
		) => {
			const image = new Image();
			const raster = new OffscreenCanvas(1, 1);
			const output = new OffscreenCanvas(
				composition.width * scale,
				composition.height * scale,
			);
			try {
				image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
				await image.decode();
				raster.width = image.naturalWidth;
				raster.height = image.naturalHeight;
				const rasterContext = raster.getContext('2d', {
					willReadFrequently: true,
				})!;
				rasterContext.drawImage(image, 0, 0);
				output.getContext('2d')!.drawImage(raster, left, top);
				return await output.convertToBlob();
			} finally {
				image.removeAttribute('src');
				raster.width = 0;
				raster.height = 0;
				output.width = 0;
				output.height = 0;
			}
		};

		const bitmap = await replay(captured.svg);
		const joint = await replay(jointSvg);
		const bitmapDevice = await replay(bitmapDeviceSvg);
		const jointDevice = await replay(jointDeviceSvg);
		const bitmapPhase = await replay(
			bitmapPhaseSvg.svg,
			bitmapPhaseSvg.left,
			bitmapPhaseSvg.top,
		);
		const jointPhase = await replay(
			jointPhaseSvg.svg,
			jointPhaseSvg.left,
			jointPhaseSvg.top,
		);
		const folder = `test/__results__/mask-joint-paint/${server.browser}/${mode}-${overflow}-${scale}-${frame}${position ? `-offset-${position.left}-${position.top}` : ''}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
			['bitmap-replay', bitmap],
			['joint', joint],
			['bitmap-device', bitmapDevice],
			['joint-device', jointDevice],
			['bitmap-phase', bitmapPhase],
			['joint-phase', jointPhase],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer())) {
				binary += String.fromCharCode(byte);
			}

			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		await server.commands.writeFile(`${folder}/original.svg`, captured.svg);
		await server.commands.writeFile(`${folder}/joint.svg`, jointSvg);
		await server.commands.writeFile(
			`${folder}/bitmap-device.svg`,
			bitmapDeviceSvg,
		);
		await server.commands.writeFile(
			`${folder}/joint-device.svg`,
			jointDeviceSvg,
		);
		await server.commands.writeFile(
			`${folder}/bitmap-phase.svg`,
			bitmapPhaseSvg.svg,
		);
		await server.commands.writeFile(
			`${folder}/joint-phase.svg`,
			jointPhaseSvg.svg,
		);
		const results = {
			mode,
			overflow,
			scale,
			frame,
			captureLeft,
			captureTop,
			styles: captured.styles,
			position,
			phase: {
				left: jointPhaseSvg.left,
				top: jointPhaseSvg.top,
				width: jointPhaseSvg.width,
				height: jointPhaseSvg.height,
			},
			actual: await countNativePixels(reference, actual),
			bitmap: await countNativePixels(reference, bitmap),
			joint: await countNativePixels(reference, joint),
			bitmapDevice: await countNativePixels(reference, bitmapDevice),
			jointDevice: await countNativePixels(reference, jointDevice),
			bitmapPhase: await countNativePixels(reference, bitmapPhase),
			jointPhase: await countNativePixels(reference, jointPhase),
		};
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify(results),
		);
		expect.soft(results.actual.mismatchedPixels).toBe(0);
		expect.soft(results.bitmap.mismatchedPixels).toBe(0);
		expect.soft(results.joint.mismatchedPixels).toBe(0);
		expect.soft(results.bitmapDevice.mismatchedPixels).toBe(0);
		expect.soft(results.jointDevice.mismatchedPixels).toBe(0);
		expect.soft(results.bitmapPhase.mismatchedPixels).toBe(0);
		expect(results.jointPhase.mismatchedPixels).toBe(0);
	},
);
