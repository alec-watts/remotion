import '../symbol-dispose';
import {expect, test} from 'vitest';
import {page, server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {largePreserve3DContext as fixture} from './fixtures/large-preserve-3d-context';
import {captureNativeReference, countNativePixels} from './native-reference';

const cases = [0, 1].flatMap((frame) =>
	[1, 2].map((scale) => ({frame, scale})),
);
test.for(cases)(
	'matches native large preserving contexts frame=$frame scale=$scale',
	{timeout: 20_000},
	async ({frame, scale}) => {
		await page.viewport(1280, 720);
		let nativeProbe: unknown = null;
		const folder = `test/__results__/large-context/${server.browser}/${frame}-${scale}`;
		const record = {
			frame,
			scale,
			nativeError: 'not-completed' as string | null,
			renderError: 'not-completed' as string | null,
			disabledError: 'not-completed' as string | null,
			comparison: null as Awaited<ReturnType<typeof countNativePixels>> | null,
			durations: {} as Record<string, number>,
			disabledComparison: null as Awaited<
				ReturnType<typeof countNativePixels>
			> | null,
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
		let reference: Blob;
		const nativeStarted = performance.now();
		try {
			const Source = fixture.component;
			reference = await captureNativeReference(
				{
					...fixture,
					id: `${fixture.id}-reference-${scale}`,
					width: fixture.width * scale,
					height: fixture.height * scale,
					component: () => (
						<div
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
				{
					omitBackground: false,
					beforeScreenshot: (host) => {
						nativeProbe = {
							devicePixelRatio: window.devicePixelRatio,
							userAgent: navigator.userAgent,
							contexts: Array.from(
								host.querySelectorAll<HTMLElement>(
									'[data-context-plane-count]',
								),
								(element) => {
									const rect = element.getBoundingClientRect();
									const style = getComputedStyle(element);
									return {
										count: Number(element.dataset.contextPlaneCount),
										transformStyle: style.transformStyle,
										transform: style.transform,
										rect: rect.toJSON(),
										hitOrder: document
											.elementsFromPoint(
												rect.left + rect.width / 2,
												rect.top + rect.height / 2,
											)
											.filter((node) => element.contains(node))
											.map((node) => node.getAttribute('data-plane-id'))
											.filter((id) => id !== null),
									};
								},
							),
						};
					},
				},
			);
			record.durations.native = performance.now() - nativeStarted;
			await save('reference', reference);
			await server.commands.writeFile(
				`${folder}/native-contexts.json`,
				JSON.stringify(nativeProbe),
			);
			record.nativeError = null;
			await checkpoint();
		} catch (error) {
			record.nativeError = String(error);
			await checkpoint();
			throw error;
		}

		const render = async (enabled: boolean) => {
			const result = await renderStillOnWeb({
				composition: fixture,
				frame,
				scale,
				inputProps: {},
				licenseKey: 'free-license',
				allowHtmlInCanvas: false,
				experimental3DRendering: enabled,
				transparent: false,
			});
			try {
				return await result.blob({format: 'png'});
			} finally {
				const canvas = await result.canvas();
				canvas.width = 0;
				canvas.height = 0;
			}
		};

		let actual: Blob;
		try {
			const started = performance.now();
			actual = await render(true);
			record.durations.enabled = performance.now() - started;
			await save('actual', actual);
			record.renderError = null;
			await checkpoint();
		} catch (error) {
			record.renderError = String(error);
			await checkpoint();
			throw error;
		}

		try {
			const started = performance.now();
			const disabled = await render(false);
			record.durations.disabled = performance.now() - started;
			await save('disabled', disabled);
			record.disabledError = null;
			record.disabledComparison = await countNativePixels(reference, disabled);
			await checkpoint();
		} catch (error) {
			record.disabledError = String(error);
			await checkpoint();
			throw error;
		}

		record.comparison = await countNativePixels(reference, actual);
		await checkpoint();
		expect(record.comparison.mismatchedPixels).toBe(0);
	},
);
