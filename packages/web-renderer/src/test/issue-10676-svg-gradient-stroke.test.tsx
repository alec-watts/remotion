import {test} from 'vitest';
import {page, server} from 'vitest/browser';
import {renderMediaOnWeb} from '../render-media-on-web';
import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {issue10676SvgGradientStroke} from './fixtures/issue-10676-svg-gradient-stroke';
import {testImage} from './utils';

test('preserves SVG gradient strokes in still and media renders', async (t) => {
	const started = performance.now();
	let renderedFrameCount = 0;
	let latestProgress: {
		renderedFrames: number;
		encodedFrames: number;
		progress: number;
	} | null = null;
	const marks: {phase: string; elapsed: number; frames: number}[] = [];
	const mark = (phase: string) =>
		marks.push({
			phase,
			elapsed: performance.now() - started,
			frames: renderedFrameCount,
		});
	mark('start');
	t.signal.addEventListener('abort', () => mark('test-abort'), {once: true});
	t.onTestFinished(async () => {
		mark('test-finished');
		await server.commands.writeFile(
			'test/__results__/gradient-timing/' + server.browser + '.json',
			JSON.stringify(
				{
					browser: server.browser,
					userAgent: navigator.userAgent,
					devicePixelRatio,
					hardwareConcurrency: navigator.hardwareConcurrency,
					state: t.task.result?.state ?? null,
					aborted: t.signal.aborted,
					renderedFrameCount,
					latestProgress,
					marks,
				},
				null,
				2,
			),
		);
	});
	const frameToTest = 80;
	await page.viewport(320, 180);
	mark('viewport-ready');
	const still = await (
		await renderStillOnWeb({
			licenseKey: 'free-license',
			composition: issue10676SvgGradientStroke,
			frame: frameToTest,
			inputProps: {},
		})
	).blob({format: 'png'});

	mark('still-blob');
	await testImage({
		blob: still,
		testId: 'issue-10676-svg-gradient-stroke-still',
		threshold: 0.02,
	});

	mark('still-snapshot');
	if (t.task.file.projectName === 'webkit') {
		return;
	}

	let mediaFrame: Blob | null = null;
	mark('media-start');
	await renderMediaOnWeb({
		licenseKey: 'free-license',
		composition: issue10676SvgGradientStroke,
		inputProps: {},
		frameRange: [0, frameToTest],
		onProgress: (progress) => {
			latestProgress = {
				renderedFrames: progress.renderedFrames,
				encodedFrames: progress.encodedFrames,
				progress: progress.progress,
			};
		},
		onFrame: async (frame) => {
			renderedFrameCount++;
			mark('media-frame');
			if (renderedFrameCount !== frameToTest + 1) {
				return frame;
			}

			const canvas = new OffscreenCanvas(320, 180);
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Could not create 2D context');
			}

			context.drawImage(frame, 0, 0);
			mediaFrame = await canvas.convertToBlob({type: 'image/png'});
			mark('frame-80-blob');
			return frame;
		},
	});

	mark('media-complete');
	if (!mediaFrame) {
		throw new Error('Expected renderMediaOnWeb() to produce a frame');
	}

	await testImage({
		blob: mediaFrame,
		testId: 'issue-10676-svg-gradient-stroke-media',
		threshold: 0.02,
	});
	mark('media-snapshot');
});
