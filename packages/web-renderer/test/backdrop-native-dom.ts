import {mkdir, writeFile} from 'node:fs/promises';
import {chromium, firefox, webkit} from 'playwright';

const output = 'test/__results__/backdrop-direct';
await mkdir(output, {recursive: true});

const viewport = {width: 200, height: 140};
const scene = `<style>
	html,body{margin:0}
	main{position:relative;width:200px;height:140px;background:#183048}
	.chart{position:absolute;left:40px;top:26px;width:25px;height:86px;background:#e6b246}
	.overlay{position:absolute;left:42px;top:37px;width:106px;height:65px}
	.filtered{-webkit-backdrop-filter:brightness(50%);backdrop-filter:brightness(50%)}
</style><main><div class="chart"></div><div class="overlay"></div></main>`;

let missingEffect = false;
for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
	const browser = await engine.launch({
		headless: true,
		...(name === 'chromium' ? {channel: 'chrome'} : {}),
	});
	try {
		const page = await browser.newPage({viewport, deviceScaleFactor: 1});
		for (const placement of ['top-level', 'iframe'] as const) {
			if (placement === 'top-level') {
				await page.setContent(scene);
			} else {
				await page.setContent(
					'<style>body{margin:0} iframe{display:block;border:0}</style><iframe width="200" height="140"></iframe>',
				);
				await page.locator('iframe').evaluate((element, html) => {
					(element as HTMLIFrameElement).srcdoc = html;
				}, scene);
			}

			const scope =
				placement === 'top-level' ? page : page.frameLocator('iframe');
			const overlay = scope.locator('.overlay');
			const shots: Buffer[] = [];
			const computed: string[] = [];
			for (const enabled of [false, true, false]) {
				computed.push(
					await overlay.evaluate(async (element, useFilter) => {
						element.classList.toggle('filtered', useFilter);
						await new Promise<void>((resolve) => {
							const frame = element.ownerDocument.defaultView!;
							frame.requestAnimationFrame(() => {
								frame.requestAnimationFrame(() => resolve());
							});
						});
						const style = getComputedStyle(element);
						return (
							style.getPropertyValue('backdrop-filter') ||
							style.getPropertyValue('-webkit-backdrop-filter')
						);
					}, enabled),
				);
				shots.push(await page.screenshot({scale: 'css'}));
			}

			const [control, reference, restored] = shots;
			const measurements = await page.evaluate(
				async (encoded) => {
					const [before, active, after] = await Promise.all(
						encoded.map(async (base64) => {
							const image = await createImageBitmap(
								new Blob(
									[Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0))],
									{
										type: 'image/png',
									},
								),
							);
							try {
								const canvas = document.createElement('canvas');
								canvas.width = image.width;
								canvas.height = image.height;
								const context = canvas.getContext('2d')!;
								context.drawImage(image, 0, 0);
								return context.getImageData(0, 0, canvas.width, canvas.height);
							} finally {
								image.close();
							}
						}),
					);
					if (
						before.width !== 200 ||
						before.height !== 140 ||
						[active, after].some(
							(image) =>
								image.width !== before.width || image.height !== before.height,
						)
					) {
						throw new Error('Unexpected reference dimensions');
					}

					let changed = 0;
					let changedOutsideOverlay = 0;
					let unrestored = 0;
					for (let offset = 0; offset < before.data.length; offset += 4) {
						const channels = before.data.subarray(offset, offset + 4);
						if (channels.some((value, i) => value !== after.data[offset + i])) {
							unrestored++;
						}

						if (
							channels.some((value, i) => value !== active.data[offset + i])
						) {
							changed++;
							const pixel = offset / 4;
							const x = pixel % before.width;
							const y = Math.floor(pixel / before.width);

							if (x < 42 || x >= 148 || y < 37 || y >= 102) {
								changedOutsideOverlay++;
							}
						}
					}

					const point = (55 * before.width + 45) * 4;
					return {
						changed,
						changedOutsideOverlay,
						unrestored,
						controlPixel: Array.from(before.data.subarray(point, point + 4)),
						filteredPixel: Array.from(active.data.subarray(point, point + 4)),
					};
				},
				shots.map((shot) => shot.toString('base64')),
			);

			const prefix = `${output}/${name}-${placement}`;
			await Promise.all([
				writeFile(`${prefix}-off.png`, control),
				writeFile(`${prefix}-on.png`, reference),
				writeFile(`${prefix}-restored.png`, restored),
				writeFile(
					`${prefix}.json`,
					JSON.stringify(
						{
							version: browser.version(),
							computed,
							...measurements,
						},
						null,
						2,
					),
				),
			]);

			if (
				computed[1] === 'none' ||
				!computed[1] ||
				measurements.changed !== 106 * 65 ||
				measurements.changedOutsideOverlay !== 0 ||
				measurements.unrestored !== 0 ||
				measurements.filteredPixel[0] >= measurements.controlPixel[0]
			) {
				missingEffect = true;
			}
		}
	} finally {
		await browser.close();
	}
}

if (missingEffect) {
	throw new Error(
		'Native backdrop-filter positive control failed. See saved captures.',
	);
}
