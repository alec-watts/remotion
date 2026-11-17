import {expect, test} from 'vitest';
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

		const actual = await capture('export', async () => {
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
		const reference = await capture('native', () =>
			captureNativeReference(native, frame, {
				omitBackground: background === 'transparent',
			}),
		);
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
				comparison,
			}),
		);
		expect(comparison?.mismatchedPixels).toBe(0);
	},
);
