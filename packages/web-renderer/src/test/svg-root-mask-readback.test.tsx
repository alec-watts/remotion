import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {
	svgDefinitionFont,
	svgDefinitionFontUrl,
} from './fixtures/svg-font-definition-review';
import {captureNativeReference, countNativePixels} from './native-reference';

const geometries = [
	{id: 'base', scale: 1, transform: 'none', background: 'white'},
	{id: 'clear', scale: 1, transform: 'none', background: 'transparent'},
	{id: 'scale-two', scale: 2, transform: 'none', background: 'white'},
	{
		id: 'fractional',
		scale: 1.5,
		transform: 'translate(5.25px, 3.5px)',
		background: '#d4f1cc',
	},
	{
		id: 'anisotropic',
		scale: 1,
		transform: 'translate(15px, 4px) scale(0.9, 1.1)',
		background: '#cbd2fc',
	},
	{
		id: 'rotated',
		scale: 1,
		transform: 'translate(11px, 4px) rotate(4deg)',
		background: 'white',
	},
] as const;

test.for(
	[0, 1].flatMap((frame) => [
		...geometries.map((geometry) => ({
			mode: 'root-mask' as const,
			geometry,
			frame,
		})),
		{mode: 'filter-image' as const, geometry: geometries[0], frame},
	]),
)(
	'renders SVG $mode with $geometry.id at frame $frame',
	async ({mode, geometry, frame}) => {
		const {id, scale, transform, background} = geometry;
		const fixture = svgDefinitionFont({
			mode,
			fontUrl: svgDefinitionFontUrl,
			backgroundColor: 'transparent',
		});
		const Scene = fixture.component;
		const composition = {
			...fixture,
			component: () => (
				<div style={{width: fixture.width, height: fixture.height, background}}>
					<div
						style={{
							position: 'absolute',
							inset: 0,
							transform,
							transformOrigin: '0 0',
						}}
					>
						<Scene />
					</div>
				</div>
			),
		};
		const Composition = composition.component;
		const native = {
			...composition,
			width: composition.width * scale,
			height: composition.height * scale,
			component: () => (
				<div
					style={{
						width: composition.width,
						height: composition.height,
						position: 'absolute',
						transform: `scale(${scale})`,
						transformOrigin: '0 0',
					}}
				>
					<Composition />
				</div>
			),
		};
		const folder = `test/__results__/svg-root-mask-readback/${server.browser}/${mode}/${id}/${frame}`;
		const capture = async (label: string, paint: () => Promise<Blob>) => {
			try {
				const png = await paint();
				let bytes = '';
				for (const byte of new Uint8Array(await png.arrayBuffer())) {
					bytes += String.fromCharCode(byte);
				}

				await server.commands.writeFile(
					`${folder}/${label}.png`,
					btoa(bytes),
					'base64',
				);
				return {png, error: null};
			} catch (error) {
				return {png: null, error: String(error)};
			}
		};

		const svgBlobs: Blob[] = [];
		const createObjectUrl = URL.createObjectURL.bind(URL);
		const observeSvg = vi
			.spyOn(URL, 'createObjectURL')
			.mockImplementation((object) => {
				if (object instanceof Blob && object.type.startsWith('image/svg+xml')) {
					svgBlobs.push(object);
				}

				return createObjectUrl(object);
			});
		const actual = await (async () => {
			try {
				return await capture('export', async () => {
					const still = await renderStillOnWeb({
						composition,
						frame,
						inputProps: {},
						licenseKey: 'free-license',
						allowHtmlInCanvas: false,
						transparent: true,
						scale,
					});
					return still.blob({format: 'png'});
				});
			} finally {
				observeSvg.mockRestore();
			}
		})();
		const reference = await capture('native', () =>
			captureNativeReference(native, frame, {
				omitBackground: background === 'transparent',
			}),
		);
		const replay = await capture('svg-device', async () => {
			if (svgBlobs.length !== 1) {
				throw new Error(
					`Expected one font-embedded SVG Blob, got ${svgBlobs.length}`,
				);
			}

			const svg = await svgBlobs[0]!.text();
			if (!svg.startsWith('<svg') || !svg.includes('data:font/woff2;')) {
				throw new Error('The production SVG blob lacks its embedded font');
			}

			const matrix = new DOMMatrix().scale(scale);
			if (transform !== 'none') {
				matrix.multiplySelf(new DOMMatrix(transform));
			}

			const {width, height} = native;
			const {a, b, c, d, e, f} = matrix;
			const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="matrix(${a} ${b} ${c} ${d} ${e} ${f})">${svg}</g></svg>`;
			await server.commands.writeFile(`${folder}/serialized.svg`, svg);
			await server.commands.writeFile(`${folder}/wrapped.svg`, wrapped);
			const paint = async (
				markup: string,
				label: string,
				captureDom: boolean,
				readback: boolean,
			) => {
				const url = createObjectUrl(
					new Blob([markup], {type: 'image/svg+xml'}),
				);
				const image = new Image();
				const canvas = new OffscreenCanvas(width, height);
				try {
					image.src = url;
					await image.decode();
					if (image.naturalWidth !== width || image.naturalHeight !== height) {
						throw new Error(
							`Unexpected device SVG size ${image.naturalWidth}×${image.naturalHeight}`,
						);
					}

					if (captureDom) {
						await capture(`${label}-dom`, () =>
							captureNativeReference(
								{
									...native,
									component: () => (
										<div style={{background, width, height}}>
											<img
												src={url}
												width={width}
												height={height}
												alt=""
												style={{display: 'block'}}
											/>
										</div>
									),
								},
								frame,
								{omitBackground: background === 'transparent'},
							),
						);
					}

					const context = canvas.getContext('2d', {
						alpha: true,
						willReadFrequently: readback,
					});
					if (!context)
						throw new Error('Cannot create the device replay Canvas');
					context.fillStyle = background;
					context.fillRect(0, 0, width, height);
					context.drawImage(image, 0, 0);
					return await canvas.convertToBlob({type: 'image/png'});
				} finally {
					URL.revokeObjectURL(url);
					canvas.width = 0;
					canvas.height = 0;
				}
			};

			const wrapperCanvas = await paint(
				wrapped,
				'svg-device',
				true,
				server.browser === 'webkit',
			);
			await capture('svg-device-readback', () =>
				paint(wrapped, 'svg-device-readback', false, true),
			);

			if (a > 0 && d > 0 && b === 0 && c === 0) {
				await capture('svg-root-viewbox', async () => {
					const root = new DOMParser().parseFromString(
						svg,
						'image/svg+xml',
					).documentElement;
					if (root.localName !== 'svg' || root.hasAttribute('viewBox')) {
						throw new Error('Expected the authored root SVG without a viewBox');
					}

					root.setAttribute('width', String(width));
					root.setAttribute('height', String(height));
					root.setAttribute(
						'viewBox',
						`${-e / a} ${-f / d} ${width / a} ${height / d}`,
					);
					root.setAttribute('preserveAspectRatio', 'none');
					const rootViewBox = new XMLSerializer().serializeToString(root);
					await server.commands.writeFile(
						`${folder}/root-viewbox.svg`,
						rootViewBox,
					);
					return paint(
						rootViewBox,
						'svg-root-viewbox',
						true,
						server.browser === 'webkit',
					);
				});
			}

			if (mode === 'root-mask') {
				for (const placement of ['group-transform', 'group-viewbox']) {
					if (
						placement === 'group-viewbox' &&
						(a <= 0 || d <= 0 || b !== 0 || c !== 0)
					) {
						continue;
					}

					const label = `svg-${placement}`;
					await capture(label, async () => {
						const root = new DOMParser().parseFromString(svg, 'image/svg+xml')
							.documentElement as unknown as SVGSVGElement;
						const authoredMask = root.getAttribute('mask');
						const painted = [...root.children].filter(
							(element) => element.localName === 'rect',
						);
						if (
							!authoredMask ||
							painted.length !== 2 ||
							root.hasAttribute('viewBox')
						) {
							throw new Error(
								'Expected a mask and two rectangles on the authored SVG root',
							);
						}

						root.removeAttribute('mask');
						const properties = [...Array.from(root.style)];
						for (const property of properties) {
							if (/^(?:-webkit-)?mask(?:-|$)/.test(property)) {
								root.style.removeProperty(property);
							}
						}

						const group = root.ownerDocument.createElementNS(
							root.namespaceURI,
							'g',
						);
						group.setAttribute('mask', authoredMask);
						painted[0]!.before(group);
						group.append(...painted);
						root.setAttribute('width', String(width));
						root.setAttribute('height', String(height));
						root.setAttribute('preserveAspectRatio', 'none');
						if (placement === 'group-viewbox') {
							root.setAttribute(
								'viewBox',
								`${-e / a} ${-f / d} ${width / a} ${height / d}`,
							);
						} else {
							root.setAttribute('viewBox', `0 0 ${width} ${height}`);
							group.setAttribute(
								'transform',
								`matrix(${a} ${b} ${c} ${d} ${e} ${f})`,
							);
						}

						const markup = new XMLSerializer().serializeToString(root);
						await server.commands.writeFile(`${folder}/${label}.svg`, markup);
						return paint(markup, label, true, server.browser === 'webkit');
					});
				}
			}

			return wrapperCanvas;
		});
		const svgComparison =
			replay.png && reference.png
				? await countNativePixels(reference.png, replay.png)
				: null;
		const comparison =
			actual.png && reference.png
				? await countNativePixels(reference.png, actual.png)
				: null;
		await server.commands.writeFile(
			`${folder}/summary.json`,
			JSON.stringify({
				userAgent: navigator.userAgent,
				actualError: actual.error,
				referenceError: reference.error,
				svgReplayError: replay.error,
				svgComparison,
				comparison,
			}),
		);
		expect.soft(replay.error).toBeNull();
		expect(comparison?.mismatchedPixels).toBe(0);
	},
);
