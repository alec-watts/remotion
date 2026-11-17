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
			const url = createObjectUrl(new Blob([wrapped], {type: 'image/svg+xml'}));
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

				await capture('svg-device-dom', () =>
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
				const ctx = canvas.getContext('2d', {
					alpha: true,
					willReadFrequently: server.browser === 'webkit',
				});
				if (!ctx) throw new Error('Cannot create the device replay Canvas');
				ctx.fillStyle = background;
				ctx.fillRect(0, 0, width, height);
				ctx.drawImage(image, 0, 0);
				return await canvas.convertToBlob({type: 'image/png'});
			} finally {
				URL.revokeObjectURL(url);
				canvas.width = 0;
				canvas.height = 0;
			}
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
