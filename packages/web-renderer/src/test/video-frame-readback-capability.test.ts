import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {canRenderMediaOnWeb} from '../can-render-media-on-web';

test('records native frame readback and actual rendering capability', async () => {
	const canvas = new OffscreenCanvas(64, 64);
	const context = canvas.getContext('2d')!;
	for (const [x, y, color] of [
		[0, 0, 'rgb(17, 83, 201)'],
		[32, 0, 'rgb(199, 41, 73)'],
		[0, 32, 'rgb(33, 177, 99)'],
		[32, 32, 'rgb(238, 161, 27)'],
	] as const) {
		context.fillStyle = color;
		context.fillRect(x, y, 32, 32);
	}

	const expected = context.getImageData(0, 0, 64, 64).data;
	const colors = [
		[17, 83, 201, 255],
		[199, 41, 73, 255],
		[33, 177, 99, 255],
		[238, 161, 27, 255],
	];
	let sourceDifferences = 0;
	for (let pixel = 0; pixel < 64 * 64; pixel++) {
		const color =
			colors[
				(pixel % 64 >= 32 ? 1 : 0) + (Math.floor(pixel / 64) >= 32 ? 2 : 0)
			];
		for (let channel = 0; channel < 4; channel++) {
			if (expected[pixel * 4 + channel] !== color[channel]) sourceDifferences++;
		}
	}

	expect(sourceDifferences).toBe(0);
	const directory = `test/__results__/frame-readback/${server.browser}`;
	const save = async (name: string, bytes: Uint8Array | Uint8ClampedArray) => {
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		await server.commands.writeFile(
			`${directory}/${name}`,
			btoa(binary),
			'base64',
		);
	};

	await save('source.rgba', expected);
	const frame = new VideoFrame(canvas, {timestamp: 123456});
	const initial = {
		format: frame.format,
		codedWidth: frame.codedWidth,
		codedHeight: frame.codedHeight,
		displayWidth: frame.displayWidth,
		displayHeight: frame.displayHeight,
		timestamp: frame.timestamp,
	};
	const copies: unknown[] = [];
	let canvasCopy: unknown = null;
	try {
		for (const [name, options] of [
			['default', null],
			['rgba', {format: 'RGBA'}],
			['bgra', {format: 'BGRA'}],
		] as const) {
			try {
				const bytes = new Uint8Array(frame.allocationSize(options ?? {}));
				const layout = await frame.copyTo(bytes, options ?? {});
				await save(`${name}.bin`, bytes);
				copies.push({name, ok: true, bytes: bytes.length, layout});
			} catch (error) {
				copies.push({name, ok: false, error: String(error)});
			}
		}

		try {
			const destination = new OffscreenCanvas(64, 64);
			const output = destination.getContext('2d')!;
			output.drawImage(frame, 0, 0);
			const actual = output.getImageData(0, 0, 64, 64).data;
			await save('canvas.rgba', actual);
			let differentChannels = 0;
			for (let i = 0; i < actual.length; i++) {
				if (actual[i] !== expected[i]) differentChannels++;
			}

			canvasCopy = {ok: true, differentChannels};
		} catch (error) {
			canvasCopy = {ok: false, error: String(error)};
		}
	} finally {
		frame.close();
	}

	const capability = await canRenderMediaOnWeb({
		width: 64,
		height: 64,
		muted: true,
		outputTarget: 'arraybuffer',
	});
	await server.commands.writeFile(
		`${directory}/report.json`,
		JSON.stringify({
			browser: server.browser,
			platform: server.platform,
			version: server.version,
			userAgent: navigator.userAgent,
			sourceDifferences,
			initial,
			copies,
			canvasCopy,
			capability,
			closed: {
				codedWidth: frame.codedWidth,
				codedHeight: frame.codedHeight,
				format: frame.format,
			},
		}),
	);
	expect(initial.codedWidth).toBe(64);
	expect(initial.codedHeight).toBe(64);
});
