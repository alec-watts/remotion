import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {supportsNativeHtmlInCanvas} from '../html-in-canvas';

test('records the native API and requires it on the pinned Chromium runner', async () => {
	const supported = supportsNativeHtmlInCanvas();
	await server.commands.writeFile(
		`test/__results__/native-preview-capability/${server.browser}.json`,
		JSON.stringify({supported, userAgent: navigator.userAgent}),
	);
	if (server.browser === 'chromium') {
		expect(navigator.userAgent).toContain('Chrome/157.');
		expect(supported).toBe(true);
	}
});
