import {createRequire} from 'node:module';
import type {} from '@vitest/browser-playwright';
import type {BrowserCommand} from 'vitest/node';

type InternalPage = {
	_connection: {
		toImpl: (page: unknown) => {
			delegate: {
				_pageProxySession: {
					sessionId: string;
					connection: {
						browserSession: {
							send: (
								method: string,
								params: Record<string, string | number | boolean>,
							) => Promise<{dataURL: string}>;
						};
					};
				};
			};
		};
	};
};

// Diagnostic only: retain the regular snapshot as an independent reference.
export const captureWebKitUi: BrowserCommand<[testId: string]> = async (
	context,
	testId,
) => {
	if (context.provider.name !== 'playwright')
		throw new Error('Expected Playwright provider');
	const require = createRequire(import.meta.url);
	if (require('playwright/package.json').version !== '1.60.0')
		throw new Error('Unqualified Playwright version');
	const locator = context.iframe.getByTestId(testId);
	const bounds = await locator.boundingBox();
	if (!bounds || bounds.width !== 300 || bounds.height !== 300)
		throw new Error('Unexpected control bounds');
	const page = context.page as unknown as InternalPage;
	const delegate = page._connection.toImpl(context.page).delegate;
	if (delegate.constructor.name !== '_WKPage')
		throw new Error('Expected packaged WebKit delegate');
	const session = delegate._pageProxySession;
	const result = await session.connection.browserSession.send(
		'Playwright.takePageScreenshot',
		{
			pageProxyId: session.sessionId,
			...bounds,
			omitDeviceScaleFactor: true,
		},
	);
	const prefix = 'data:image/png;base64,';
	if (!result.dataURL.startsWith(prefix))
		throw new Error('Expected UI-process PNG');
	const repeat = await locator.screenshot({scale: 'css'});
	return {
		ui: result.dataURL.slice(prefix.length),
		repeat: repeat.toString('base64'),
		bounds,
	};
};
