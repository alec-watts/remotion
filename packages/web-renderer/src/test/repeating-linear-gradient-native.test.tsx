import '../symbol-dispose';
import {expect, test} from 'vitest';
import {page, server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {repeatingLinearGradient} from './fixtures/repeating-linear-gradient';
import {captureNativeReference, countNativePixels} from './native-reference';

const fixtures = (['background', 'mask'] as const).map((kind) => ({
	kind,
	fixture: repeatingLinearGradient(kind),
}));
const cases = fixtures.flatMap(({kind, fixture}) =>
	[0, 1].flatMap((frame) =>
		[0.5, 1, 1.25, 1.5, 2, 2.5].map((scale) => ({kind, fixture, frame, scale})),
	),
);

test.for(cases)(
	'compares repeating linear gradients kind=$kind frame=$frame scale=$scale',
	{timeout: 20_000},
	async ({kind, fixture, frame, scale}) => {
		await page.viewport(1600, 1000);
		const folder = `test/__results__/repeating-gradient/${server.browser}/${kind}/${frame}-${scale}`;
		const record = {
			kind,
			frame,
			scale,
			nativeError: 'not-completed' as string | null,
			renderError: 'not-completed' as string | null,
			comparison: null as Awaited<ReturnType<typeof countNativePixels>> | null,
		};
		const checkpoint = () =>
			server.commands.writeFile(
				`${folder}/comparison.json`,
				JSON.stringify(record),
			);
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

		await checkpoint();
		const Source = fixture.component;
		let reference: Blob;
		let serializedSource: string | null = null;
		try {
			reference = await captureNativeReference(
				{
					...fixture,
					id: `${fixture.id}-reference-${scale}`,
					width: fixture.width * scale,
					height: fixture.height * scale,
					component: () => (
						<div
							ref={(element) => {
								if (element)
									serializedSource = new XMLSerializer().serializeToString(
										element,
									);
							}}
							style={{
								position: 'absolute',
								width: fixture.width,
								height: fixture.height,
								transform: `scale(${scale})`,
								transformOrigin: '0 0',
							}}
						>
							<Source />
						</div>
					),
				},
				frame,
				{omitBackground: false},
			);
			await save('reference', reference);
			record.nativeError = null;
			await checkpoint();
		} catch (error) {
			record.nativeError = String(error);
			await checkpoint();
			throw error;
		}

		let actual: Blob;
		try {
			actual = await (
				await renderStillOnWeb({
					composition: fixture,
					frame,
					scale,
					inputProps: {},
					licenseKey: 'free-license',
					allowHtmlInCanvas: false,
					transparent: false,
				})
			).blob({format: 'png'});
			await save('actual', actual);
			record.renderError = null;
			await checkpoint();
		} catch (error) {
			record.renderError = String(error);
			await checkpoint();
			throw error;
		}

		// Probe the browser's own CSS gradient rasterizer at the same physical size.
		// This diagnostic does not replace the original renderer comparison.
		for (const density of [1, 2]) {
			const sourceProbe = {
				density,
				devicePixelRatio: window.devicePixelRatio,
				viewportScale: window.visualViewport?.scale ?? null,
				userAgent: navigator.userAgent,
				error: 'not-completed' as string | null,
				comparison: null as Awaited<
					ReturnType<typeof countNativePixels>
				> | null,
			};
			const name = density === 1 ? 'native-source' : 'native-source-density-2';
			try {
				if (serializedSource === null)
					throw new Error('Native source was not serialized');
				const width = fixture.width * scale;
				const height = fixture.height * scale;
				const image = new Image();
				const viewport =
					density === 1 ? '' : ` viewBox="0 0 ${width} ${height}"`;
				image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * density}" height="${height * density}"${viewport}><foreignObject width="${width}" height="${height}">${serializedSource}</foreignObject></svg>`)}`;
				await image.decode();
				const canvas = new OffscreenCanvas(width, height);
				try {
					const context = canvas.getContext('2d')!;
					if (density === 1) context.drawImage(image, 0, 0);
					else context.drawImage(image, 0, 0, width, height);
					const blob = await canvas.convertToBlob({type: 'image/png'});
					await save(name, blob);
					sourceProbe.comparison = await countNativePixels(reference, blob);
					sourceProbe.error = null;
				} finally {
					canvas.width = 0;
					canvas.height = 0;
				}
			} catch (error) {
				sourceProbe.error = String(error);
			}

			await server.commands.writeFile(
				`${folder}/${name}.json`,
				JSON.stringify(sourceProbe),
			);
		}

		record.comparison = await countNativePixels(reference, actual);
		await checkpoint();
		expect(record.comparison.mismatchedPixels).toBe(0);
	},
);
