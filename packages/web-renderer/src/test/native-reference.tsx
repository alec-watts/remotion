import {Player} from '@remotion/player';
import type {} from '@vitest/browser-playwright';
import type {ComponentType} from 'react';
import {useContext} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {Internals, type DelayRenderScope} from 'remotion';
import {expect} from 'vitest';
import {page, server} from 'vitest/browser';
import type {NativePngComparison} from './compare-native-png';

declare module 'vitest/browser' {
	interface BrowserCommands {
		compareNativePngs: (
			reference: string,
			actual: string,
			createDiff: boolean,
		) => Promise<NativePngComparison>;
	}
}

type Fixture = {
	component: ComponentType;
	id: string;
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
};

// Capture browser painting, not another invocation of the DOM composer.
// Fixtures must be deterministic and finish async work through Player buffering.
export const captureNativeReference = async (
	fixture: Fixture,
	frame = 0,
	{omitBackground = true}: {omitBackground?: boolean} = {},
) => {
	const host = document.createElement('div');
	host.dataset.testid = `${fixture.id}-native-${frame}`;
	Object.assign(host.style, {
		width: `${fixture.width}px`,
		height: `${fixture.height}px`,
		position: 'relative',
	});
	document.body.appendChild(host);
	const root = createRoot(host);
	const delayRenderScope: DelayRenderScope = {
		remotion_renderReady: true,
		remotion_delayRenderTimeouts: {},
		remotion_puppeteerTimeout: 10000,
		remotion_attempt: 0,
		remotion_delayRenderHandles: [],
	};
	let renderError: Error | null = null;
	const deadline = performance.now() + 10000;
	const checkReadyError = () => {
		if (renderError) throw renderError;
		if (delayRenderScope.remotion_cancelledErrorObject)
			throw delayRenderScope.remotion_cancelledErrorObject;
		if (delayRenderScope.remotion_cancelledError !== undefined) {
			const error = new Error(
				delayRenderScope.remotion_cancelledError
					.split('\n')[0]
					.replace(/^Error: /, ''),
			);
			error.stack = delayRenderScope.remotion_cancelledError;
			throw error;
		}

		if (performance.now() > deadline)
			throw new Error('Native reference remained pending or buffering');
	};

	let readBuffering: () => boolean;
	const isPending = () =>
		!delayRenderScope.remotion_renderReady ||
		delayRenderScope.remotion_delayRenderHandles.length > 0 ||
		readBuffering!();
	const nextReadyFrame = async () => {
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => resolve()),
		);
		checkReadyError();
	};

	const Component = fixture.component;
	const Reference = () => {
		readBuffering = useContext(Internals.SetTimelineContext).isBuffering;
		return <Component />;
	};

	try {
		flushSync(() => {
			root.render(
				<Internals.DelayRenderContextType.Provider value={delayRenderScope}>
					<Player
						component={Reference}
						compositionWidth={fixture.width}
						compositionHeight={fixture.height}
						fps={fixture.fps}
						durationInFrames={fixture.durationInFrames}
						initialFrame={frame}
						style={{width: fixture.width, height: fixture.height}}
						acknowledgeRemotionLicense
						errorFallback={({error}) => {
							renderError = error;
							return null;
						}}
					/>
				</Internals.DelayRenderContextType.Provider>,
			);
		});

		// Delay-render handles and Player playback buffering are independent stores.
		// The local scope completes only after asynchronous fixture DOM has committed.
		do {
			do {
				await nextReadyFrame();
			} while (isPending());

			host.getBoundingClientRect();
			const resources = {ready: false, error: null as unknown};
			Promise.all([
				document.fonts.ready,
				...Array.from(host.querySelectorAll('img'), (img) => img.decode()),
			]).then(
				() => {
					resources.ready = true;
				},
				(error: unknown) => {
					resources.error = error;
					resources.ready = true;
				},
			);
			do {
				await nextReadyFrame();
			} while (!resources.ready);

			if (resources.error !== null) throw resources.error;
		} while (isPending());

		// `save: false` skips writing the PNG to disk. Vitest 5.0.3 then resolves
		// to the base64 string even though its types still declare {path, base64}.
		const screenshot: string | {base64: string} = await page
			.getByTestId(host.dataset.testid)
			.screenshot({
				base64: true,
				save: false,
				omitBackground,
				scale: 'css',
				style:
					'html, body, iframe[data-vitest] { background: transparent !important; }',
			});
		const base64 =
			typeof screenshot === 'string' ? screenshot : screenshot.base64;
		return new Blob(
			[Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
			{type: 'image/png'},
		);
	} finally {
		try {
			root.unmount();
		} finally {
			for (const pending of Object.values(
				delayRenderScope.remotion_delayRenderTimeouts,
			))
				clearTimeout(pending.timeout);
			delayRenderScope.remotion_delayRenderTimeouts = {};
			delayRenderScope.remotion_delayRenderHandles = [];
			delayRenderScope.remotion_renderReady = true;
			host.remove();
		}
	}
};

// Compare decoded PNG bytes before canvas can round translucent RGB values.
const compareNativePixelData = async (
	reference: Blob,
	actual: Blob,
	createDiff: boolean,
) => {
	const encode = async (blob: Blob) => {
		let binary = '';
		for (const byte of new Uint8Array(await blob.arrayBuffer()))
			binary += String.fromCharCode(byte);
		return btoa(binary);
	};

	const [expected, received] = await Promise.all([
		encode(reference),
		encode(actual),
	]);
	return server.commands.compareNativePngs(expected, received, createDiff);
};

export const countNativePixels = async (reference: Blob, actual: Blob) => {
	const {mismatchedPixels, maxChannelDelta} = await compareNativePixelData(
		reference,
		actual,
		false,
	);
	return {mismatchedPixels, maxChannelDelta};
};

const nativeCaptureCounts = new Map<string, number>();

export const compareNativePixels = async (reference: Blob, actual: Blob) => {
	const {mismatchedPixels, maxChannelDelta, diff, width, height} =
		await compareNativePixelData(reference, actual, true);

	const captureState = expect.getState() as {
		currentTestName?: string;
		testPath?: string;
	};
	const captureTestName = captureState.currentTestName ?? 'unknown-native-test';
	const captureFile =
		captureState.testPath?.split('/').pop() ?? 'unknown-native-file';
	const identity = captureFile + '\n' + captureTestName;
	const ordinal = nativeCaptureCounts.get(identity) ?? 0;
	nativeCaptureCounts.set(identity, ordinal + 1);
	const captureHash = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)),
	);
	const key = Array.from(captureHash, (byte) =>
		byte.toString(16).padStart(2, '0'),
	).join('');
	const directory = `test/__results__/svg-opaque-integer-font/${server.browser}/native/${key}/${ordinal}`;
	for (const [label, blob] of [
		['reference', reference],
		['actual', actual],
	] as const) {
		let binary = '';
		for (const byte of new Uint8Array(await blob.arrayBuffer()))
			binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			directory + '/' + label + '.b64',
			btoa(binary),
		);
	}

	await server.commands.writeFile(
		directory + '/metadata.json',
		JSON.stringify({
			file: captureFile,
			name: captureTestName,
			ordinal,
			width,
			height,
			mismatchedPixels,
			maxChannelDelta,
			userAgent: navigator.userAgent,
		}),
	);
	const diffBlob = new Blob(
		[Uint8Array.from(atob(diff!), (character) => character.charCodeAt(0))],
		{type: 'image/png'},
	);
	let evidence: string | null = null;
	if (mismatchedPixels > 0) {
		const testName = expect.getState().currentTestName ?? 'native-pixels';
		const originals = await Promise.all(
			[reference, actual, diffBlob].map(async (blob) => {
				const bytes = new Uint8Array(await blob.arrayBuffer());
				const hash = new Uint8Array(
					await crypto.subtle.digest('SHA-256', bytes),
				);
				let binary = '';
				for (const byte of bytes) binary += String.fromCharCode(byte);
				return {
					base64: btoa(binary),
					sha256: Array.from(hash, (byte) =>
						byte.toString(16).padStart(2, '0'),
					).join(''),
				};
			}),
		);
		evidence = `src/test/__screenshots__/native-pixel-failures/${server.browser}/${testName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}-${originals[0].sha256}-${originals[1].sha256}`;
		await Promise.all(
			['reference', 'actual', 'diff'].map((name, index) =>
				server.commands.writeFile(
					`${evidence}/${name}.png`,
					originals[index].base64,
					'base64',
				),
			),
		);
		await server.commands.writeFile(
			`${evidence}/comparison.json`,
			JSON.stringify(
				{
					testName,
					browser: server.browser,
					platform: server.platform,
					runtime: server.version,
					userAgent: navigator.userAgent,
					devicePixelRatio: window.devicePixelRatio,
					width,
					height,
					mismatchedPixels,
					maxChannelDelta,
					referenceSha256: originals[0].sha256,
					actualSha256: originals[1].sha256,
				},
				null,
				2,
			),
		);
	}

	return {mismatchedPixels, maxChannelDelta, diff: diffBlob, evidence};
};

export const savePixelEvidence = async (
	blob: Blob,
	testId: string,
	{omitBackground = true}: {omitBackground?: boolean} = {},
) => {
	const image = document.createElement('img');
	const url = URL.createObjectURL(blob);
	image.src = url;
	image.dataset.testid = testId;
	image.style.display = 'block';
	document.body.appendChild(image);
	try {
		await image.decode();
		return await page.getByTestId(testId).screenshot({
			omitBackground,
			scale: 'css',
			style:
				'html, body, iframe[data-vitest] { background: transparent !important; }',
		});
	} finally {
		image.remove();
		URL.revokeObjectURL(url);
	}
};
