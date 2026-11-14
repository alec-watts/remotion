import {test} from 'vitest';
import {page} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {issue7050Repro} from './fixtures/issue-7050-repro';
import {makeRendererPhaseLog} from './renderer-phase-log';
import {testImage} from './utils';

test('should render issue-7050-repro', async () => {
	const phase = makeRendererPhaseLog('issue-7050-repro', null);
	phase('start');
	await page.viewport(1600, 800);
	phase('viewport-ready');

	const still = await renderStillOnWeb({
		licenseKey: 'free-license',
		composition: issue7050Repro,
		frame: 0,
		inputProps: {},
		scale: 2,
	});
	phase('still-rendered');
	const blob = await still.blob({format: 'png'});
	phase('still-encoded');

	await testImage({blob, testId: 'issue-7050-repro'});
});
