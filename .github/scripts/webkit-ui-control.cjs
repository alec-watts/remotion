const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

const requireRenderer = createRequire(
	path.resolve('packages/web-renderer/package.json'),
);
const playwright = requireRenderer('playwright');
const input = require('./webkit-ui-control-input.json');
const output = path.resolve('webkit-ui-control-results');
fs.mkdirSync(output, {recursive: true});

(async () => {
	assert.equal(requireRenderer('playwright/package.json').version, '1.60.0');
	assert.equal(input.cases.length, 34);
	const browser = await playwright.webkit.launch({headless: true});
	const results = [];
	try {
		const page = await browser.newPage({
			viewport: {width: 300, height: 300},
			deviceScaleFactor: 1,
		});
		const implementation = page._connection.toImpl(page);
		const delegate = implementation.delegate;
		assert.equal(delegate.constructor.name, '_WKPage');
		const session = delegate._pageProxySession;
		const readNativeHitTarget = () =>
			page.evaluate(() => {
				const host = document.getElementById('host');
				const plane = host.firstElementChild.firstElementChild;
				const rect = plane.getBoundingClientRect();
				const x = rect.left + rect.width / 2;
				const y = rect.top + rect.height / 2;
				const hit = document.elementFromPoint(x, y);
				const style = getComputedStyle(plane);
				const matrix = new DOMMatrixReadOnly(style.transform);
				return {
					x,
					y,
					bounds: {
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: rect.height,
					},
					hitIsPlaneOrDescendant: hit !== null && plane.contains(hit),
					hitKind:
						hit === plane
							? 'plane'
							: hit && plane.contains(hit)
								? 'descendant'
								: (hit?.tagName ?? null),
					backfaceVisibility: style.backfaceVisibility,
					parentTransformStyle: getComputedStyle(plane.parentElement)
						.transformStyle,
					forwardM33: matrix.m33,
					inverseM33: matrix.inverse().m33,
				};
			});
		for (const item of input.cases) {
			assert.equal(
				crypto.createHash('sha256').update(item.markup).digest('hex'),
				item.markupSha256,
			);
			await page.setContent(
				'<html><body style="margin:0;background:white"><div id="host" style="position:relative;width:300px;height:300px;background:white"></div></body></html>',
			);
			await page.locator('#host').evaluate((element, markup) => {
				element.innerHTML = markup;
			}, item.markup);
			await page.evaluate(
				() =>
					new Promise((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(resolve)),
					),
			);
			const before = await page.locator('#host').innerHTML();
			const hitBefore = await readNativeHitTarget();
			const directory = path.join(output, `${item.variant}-${item.frame}`);
			fs.mkdirSync(directory, {recursive: true});
			await page.screenshot({
				path: path.join(directory, 'snapshot-before.png'),
				scale: 'css',
			});
			const snapshot = await session.connection.browserSession.send(
				'Playwright.takePageScreenshot',
				{
					pageProxyId: session.sessionId,
					x: 0,
					y: 0,
					width: 300,
					height: 300,
					omitDeviceScaleFactor: true,
				},
			);
			assert.ok(snapshot.dataURL.startsWith('data:image/png;base64,'));
			fs.writeFileSync(
				path.join(directory, 'ui-process.png'),
				Buffer.from(
					snapshot.dataURL.slice('data:image/png;base64,'.length),
					'base64',
				),
			);
			await page.screenshot({
				path: path.join(directory, 'snapshot-after.png'),
				scale: 'css',
			});
			assert.equal(await page.locator('#host').innerHTML(), before);
			const hitAfter = await readNativeHitTarget();
			assert.deepEqual(hitAfter, hitBefore);
			results.push({
				...item,
				hitBefore,
				hitAfter,
				browserVersion: browser.version(),
				userAgent: await page.evaluate(() => navigator.userAgent),
			});
			fs.writeFileSync(
				path.join(output, 'results.json'),
				JSON.stringify(results, null, 2),
			);
		}
	} finally {
		await browser.close();
	}
	assert.equal(results.length, 34);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
