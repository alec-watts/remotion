import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const output = 'test/__results__/backdrop-matched-blend';
const executablePath = process.env.REMOTION_CHROME_EXECUTABLE;
if (!executablePath) throw new Error('Missing pinned Chrome executable');
await mkdir(output, {recursive: true});

const viewport = {width: 200, height: 140};
for (const mode of ['default', 'disable-gpu'] as const) {
	const browser = await chromium.launch({
		executablePath,
		headless: true,
		args: mode === 'disable-gpu' ? ['--disable-gpu'] : [],
	});
	try {
		if (browser.version() !== '157.0.8103.79') {
			throw new Error(`Unexpected Chrome version: ${browser.version()}`);
		}

		const session = await browser.newBrowserCDPSession();
		const {gpu} = await session.send('SystemInfo.getInfo');
		const page = await browser.newPage({viewport, deviceScaleFactor: 1});
		const report = [];
		for (const frame of [0, 1]) {
			const charts = Array.from({length: 5}, (_, i) => {
				const left = i * 40 + frame * 8;
				const color = i % 2 ? '#e6b246' : '#588ac0';
				return `<div style="position:absolute;top:26px;left:${left}px;width:25px;height:86px;background:${color}"></div>`;
			}).join('');
			for (const blend of [false, true]) {
				for (const filtered of [false, true]) {
					const group = blend
						? 'opacity:0.6;mix-blend-mode:multiply;background-color:#ff8a42cc'
						: '';
					const filter = filtered ? 'brightness(0.5)' : 'none';
					const scene = `<style>html,body{margin:0}</style><main style="position:relative;width:200px;height:140px;background:#183048">${charts}<div id="overlay" style="position:absolute;left:42px;top:37px;width:106px;height:65px;backdrop-filter:${filter};${group}"></div></main>`;
					await page.setContent(scene);
					const computed = await page
						.locator('#overlay')
						.evaluate(async (element) => {
							await new Promise<void>((resolve) => {
								requestAnimationFrame(() => {
									requestAnimationFrame(() => resolve());
								});
							});
							const style = getComputedStyle(element);
							return [style.backdropFilter, style.mixBlendMode, style.opacity];
						});
					const name = `${mode}-${blend ? 'blend' : 'brightness'}-${filtered ? 'on' : 'off'}-${frame}`;
					await page.screenshot({scale: 'css', path: `${output}/${name}.png`});
					report.push({name, computed});
				}
			}
		}

		await writeFile(
			`${output}/${mode}.json`,
			JSON.stringify(
				{
					browserVersion: browser.version(),
					gpu: {
						glRenderer: gpu.auxAttributes?.glRenderer,
						skiaBackend: gpu.auxAttributes?.skiaBackendType,
						featureStatus: gpu.featureStatus,
					},
					report,
				},
				null,
				2,
			),
		);
	} finally {
		await browser.close();
	}
}
