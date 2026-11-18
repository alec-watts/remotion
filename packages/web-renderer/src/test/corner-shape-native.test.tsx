import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {createNativeMaskSvg} from '../drawing/native-mask-svg';
import {turnSvgIntoDrawable} from '../drawing/turn-svg-into-drawable';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	cornerShapeGrid,
	cornerShapeValues,
	cornerShapeVariants,
} from './fixtures/corner-shape-grid';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	cornerShapeVariants.flatMap((variant) =>
		[1, 1.25].flatMap((scale) =>
			[0, 1].map((frame) => ({variant, scale, frame})),
		),
	),
)(
	'compares shaped corners $variant scale=$scale frame=$frame',
	async ({variant, scale, frame}) => {
		const composition = cornerShapeGrid(variant);
		const Component = composition.component;
		const support = cornerShapeValues.map((value) => {
			const probe = document.createElement('div');
			probe.style.setProperty('corner-shape', value);
			document.body.appendChild(probe);
			try {
				const computed = getComputedStyle(probe);
				return {
					value,
					supported: CSS.supports('corner-shape', value),
					computed: computed.getPropertyValue('corner-shape'),
					corners: ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(
						(corner) => computed.getPropertyValue(`corner-${corner}-shape`),
					),
				};
			} finally {
				probe.remove();
			}
		});
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
			{omitBackground: false},
		);
		const actual = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition,
				frame,
				scale,
				inputProps: {},
				allowHtmlInCanvas: false,
				transparent: false,
			})
		).blob({format: 'png'});
		const folder = `test/__results__/corner-shape/${server.browser}/${variant}-${scale}-${frame}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		const result = await countNativePixels(reference, actual);
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify({variant, scale, frame, support, ...result}),
		);
		// Keep the original capture and renderer result as the first observations.
		// Probe native CSS in the existing SVG carrier without changing production.
		const probes: Record<
			string,
			{error: string | null; mismatchedPixels: number | null}
		> = {};
		const checkpoint = async () => {
			await server.commands.writeFile(
				`${folder}/carrier.json`,
				JSON.stringify({variant, scale, frame, support, probes}),
			);
		};

		const save = async (name: string, blob: Blob) => {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		};

		for (const name of [
			'bounded',
			'bounded-repeat',
			'svg-image',
			'direct',
			'readback',
			'seeded-readback',
			'longhand-svg-image',
			'longhand-direct',
			'longhand-readback',
			'longhand-seeded-readback',
			'device-svg-image',
			'device-direct',
			'device-readback',
			'device-seeded-readback',
		])
			probes[name] = {error: 'not-completed', mismatchedPixels: null};
		await checkpoint();
		let cloned: HTMLDivElement | null = null;
		let longhandRules = '';
		let authoredDeclarations: unknown[] = [];
		let clonedDeclarations: unknown[] = [];
		const Captured = cornerShapeGrid(variant, (element) => {
			if (!element) return;
			cloned = element.cloneNode(true) as HTMLDivElement;
			clonedDeclarations = Array.from(
				cloned.querySelectorAll<HTMLElement>('[data-corner-shape]'),
				(node) => ({
					shape: node.getAttribute('data-corner-shape'),
					authored: node.getAttribute('style'),
					cssText: node.style.cssText,
					properties: Array.from(node.style, (property) => ({
						property,
						value: node.style.getPropertyValue(property),
						priority: node.style.getPropertyPriority(property),
					})),
					longhands: ['top-left', 'top-right', 'bottom-right', 'bottom-left']
						.flatMap((corner) => [
							`border-${corner}-radius`,
							`corner-${corner}-shape`,
						])
						.map((property) => ({
							property,
							value: node.style.getPropertyValue(property),
							priority: node.style.getPropertyPriority(property),
						})),
				}),
			);
			authoredDeclarations = Array.from(
				element.querySelectorAll<HTMLElement>('[data-corner-shape]'),
				(node) => ({
					shape: node.getAttribute('data-corner-shape'),
					authored: node.getAttribute('style'),
					cssText: node.style.cssText,
					corner: node.style.getPropertyValue('corner'),
					properties: Array.from(node.style, (property) => ({
						property,
						value: node.style.getPropertyValue(property),
						priority: node.style.getPropertyPriority(property),
					})),
					longhands: ['top-left', 'top-right', 'bottom-right', 'bottom-left']
						.flatMap((corner) => [
							`border-${corner}-radius`,
							`corner-${corner}-shape`,
						])
						.map((property) => ({
							property,
							value: node.style.getPropertyValue(property),
							priority: node.style.getPropertyPriority(property),
						})),
				}),
			);
			longhandRules = Array.from(
				element.querySelectorAll('[data-corner-shape]'),
				(node) => {
					const style = getComputedStyle(node);
					const declarations = [
						'top-left',
						'top-right',
						'bottom-right',
						'bottom-left',
					]
						.flatMap((corner) =>
							[`border-${corner}-radius`, `corner-${corner}-shape`].map(
								(property) => {
									const value = style.getPropertyValue(property);
									return value ? `${property}: ${value} !important;` : '';
								},
							),
						)
						.join('');
					return `[data-corner-shape=${JSON.stringify(node.getAttribute('data-corner-shape'))}] {${declarations}}`;
				},
			).join('\n');
		}).component;
		const bounded = await captureNativeReference(
			{
				...composition,
				width: composition.width * scale,
				height: composition.height * scale,
				component: () => (
					<div
						style={{
							position: 'relative',
							width: composition.width,
							height: composition.height,
							transform: `scale(${scale})`,
							transformOrigin: '0 0',
						}}
					>
						<Captured />
					</div>
				),
			},
			frame,
			{omitBackground: false},
		);
		await save('bounded', bounded);
		await server.commands.writeFile(
			`${folder}/authored-declarations.json`,
			JSON.stringify({authoredDeclarations, clonedDeclarations}),
		);
		probes.bounded = {
			error: null,
			...(await countNativePixels(reference, bounded)),
		};
		await checkpoint();
		if (!cloned)
			throw new Error('Corner fixture did not commit its native DOM');
		const {svg, target} = createNativeMaskSvg({
			ownerDocument: document,
			maskRect: new DOMRect(0, 0, composition.width, composition.height),
			precomposeRect: new DOMRect(0, 0, composition.width, composition.height),
			referenceRect: new DOMRect(0, 0, composition.width, composition.height),
			width: composition.width * scale,
			height: composition.height * scale,
		});
		target.replaceChildren(cloned);
		let image = await turnSvgIntoDrawable(svg);
		try {
			const prefix = 'data:image/svg+xml;charset=utf-8,';
			expect(image.src.startsWith(prefix)).toBe(true);
			await server.commands.writeFile(
				`${folder}/carrier.svg`,
				decodeURIComponent(image.src.slice(prefix.length)),
			);
			for (const mode of [
				'bounded-repeat',
				'svg-image',
				'direct',
				'readback',
				'seeded-readback',
				'longhand-svg-image',
				'longhand-direct',
				'longhand-readback',
				'longhand-seeded-readback',
				'device-svg-image',
				'device-direct',
				'device-readback',
				'device-seeded-readback',
			] as const) {
				let raster: OffscreenCanvas | null = null;
				let output: OffscreenCanvas | null = null;
				try {
					if (mode === 'longhand-svg-image') {
						// A text rule preserves the explicit declarations through XML
						// serialization instead of CSSOM recombining a shorthand.
						const style = document.createElementNS(
							'http://www.w3.org/2000/svg',
							'style',
						);
						style.textContent = longhandRules;
						svg.prepend(style);
						image.removeAttribute('src');
						image = await turnSvgIntoDrawable(svg);
						expect(image.src.startsWith(prefix)).toBe(true);
						await server.commands.writeFile(
							`${folder}/carrier-longhand.svg`,
							decodeURIComponent(image.src.slice(prefix.length)),
						);
					}

					if (mode === 'device-svg-image') {
						// Preserve the measured longhand rules, moving scale from the
						// SVG viewBox to the same CSS transform as the native wrapper.
						const width = composition.width * scale;
						const height = composition.height * scale;
						svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
						const foreignObject = svg.querySelector('foreignObject')!;
						foreignObject.setAttribute('width', String(width));
						foreignObject.setAttribute('height', String(height));
						const viewport = foreignObject.firstElementChild as HTMLDivElement;
						viewport.style.width = `${width}px`;
						viewport.style.height = `${height}px`;
						target.style.width = `${composition.width}px`;
						target.style.height = `${composition.height}px`;
						target.style.transformOrigin = '0 0';
						target.style.transform = `scale(${scale})`;
						image.removeAttribute('src');
						image = await turnSvgIntoDrawable(svg);
						expect(image.src.startsWith(prefix)).toBe(true);
						await server.commands.writeFile(
							`${folder}/carrier-device.svg`,
							decodeURIComponent(image.src.slice(prefix.length)),
						);
					}

					const transfer = mode.replace(/^(longhand|device)-/, '');
					let blob: Blob;
					if (mode === 'bounded-repeat') {
						blob = await captureNativeReference(
							{
								...composition,
								width: composition.width * scale,
								height: composition.height * scale,
								component: () => (
									<div
										style={{
											position: 'relative',
											width: composition.width,
											height: composition.height,
											transform: `scale(${scale})`,
											transformOrigin: '0 0',
										}}
									>
										<Component />
									</div>
								),
							},
							frame,
							{omitBackground: false},
						);
					} else if (transfer === 'svg-image') {
						blob = await captureNativeReference(
							{
								...composition,
								width: composition.width * scale,
								height: composition.height * scale,
								component: () => (
									<img
										src={image.src}
										style={{
											display: 'block',
											width: composition.width * scale,
											height: composition.height * scale,
										}}
									/>
								),
							},
							frame,
							{omitBackground: false},
						);
					} else {
						raster = new OffscreenCanvas(
							composition.width * scale,
							composition.height * scale,
						);
						const context = raster.getContext('2d', {
							willReadFrequently: transfer !== 'direct',
						})!;
						if (transfer === 'seeded-readback') {
							context.fillStyle = 'white';
							context.fillRect(0, 0, raster.width, raster.height);
						}

						context.drawImage(image, 0, 0);
						if (transfer === 'direct') {
							blob = await raster.convertToBlob({type: 'image/png'});
						} else {
							output = new OffscreenCanvas(raster.width, raster.height);
							output
								.getContext('2d')!
								.putImageData(
									context.getImageData(0, 0, raster.width, raster.height),
									0,
									0,
								);
							blob = await output.convertToBlob({type: 'image/png'});
						}
					}

					await save(mode, blob);
					probes[mode] = {
						error: null,
						...(await countNativePixels(bounded, blob)),
					};
				} catch (error) {
					probes[mode] = {error: String(error), mismatchedPixels: null};
				} finally {
					if (raster) {
						raster.width = 0;
						raster.height = 0;
					}

					if (output) {
						output.width = 0;
						output.height = 0;
					}

					await checkpoint();
				}
			}
		} finally {
			image.removeAttribute('src');
		}

		expect.soft(result.mismatchedPixels).toBe(0);
		for (const probe of Object.values(probes)) {
			expect.soft(probe.error).toBe(null);
			expect.soft(probe.mismatchedPixels).toBe(0);
		}
	},
);
