const {chromium} = require('playwright');
const {pathToFileURL} = require('node:url');
const {resolve} = require('node:path');
const {rename, mkdir} = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: {width: 960, height: 600},
      recordVideo: {dir: 'capture', size: {width: 960, height: 600}},
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(resolve('index.html')).href);
    await page.getByText('Composition A', {exact: true}).waitFor();
    await page.getByText('Healthy composition B', {exact: true}).waitFor();
    await page.waitForTimeout(2500);
    await page.getByRole('button', {name: 'Reject Player A’s pending task'}).click();
    await page.getByRole('status').filter({hasText: 'Global cancellation: Player A: async effect failed'}).waitFor();
    if (await page.getByRole('alert').count() !== 0) throw new Error('Player error fallback appeared');
    await page.getByText('Composition A', {exact: true}).waitFor();
    await page.getByText('Healthy composition B', {exact: true}).waitFor();
    await mkdir('evidence', {recursive: true});
    await page.screenshot({path: 'evidence/after.png'});
    await page.waitForTimeout(4500);
    await context.close();
    await rename(await page.video().path(), 'evidence/browser-recording.webm');
    console.log('Verified: rejection sets global cancellation without displaying Player A fallback.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
