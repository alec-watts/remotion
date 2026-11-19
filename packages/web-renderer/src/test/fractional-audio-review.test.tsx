import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	Input,
	VideoSampleSink,
} from 'mediabunny';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderMediaOnWeb} from '../render-media-on-web';
import '../symbol-dispose';
import {
	fractionalLoopedVideo,
	fractionalNestedAudio,
	fractionalLoopingSequence,
	fractionalRgbSource,
	fractionalShortVideo,
	fractionalUnusedImage,
} from './fixtures/fractional-audio-review';

const savePixels = async (label: string, bytes: Uint8ClampedArray) => {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	await server.commands.writeFile(
		`test/__results__/fractional-review/${server.browser}/${label}.rgba`,
		btoa(binary),
		'base64',
	);
};

const saveMedia = async (label: string, blob: Blob) => {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	await server.commands.writeFile(
		`test/__results__/fractional-review/${server.browser}/${label}.media`,
		btoa(binary),
		'base64',
	);
};

const readFrame = (frame: VideoFrame) => {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const context = canvas.getContext('2d')!;
	context.drawImage(frame, 0, 0);
	return context.getImageData(0, 0, 64, 64).data;
};

test.each([fractionalLoopedVideo, fractionalShortVideo])(
	'keeps every decoded video pixel independent of export audio in $id',
	async (composition) => {
		using source = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(await (await fetch(fractionalRgbSource())).blob()),
		});
		const track = await source.getPrimaryVideoTrack();
		expect(track).not.toBeNull();
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const context = canvas.getContext('2d')!;
		const expected: Uint8ClampedArray[] = [];
		for await (const sample of new VideoSampleSink(track!).samples()) {
			try {
				sample.draw(context, 0, 0);
				expected.push(context.getImageData(0, 0, 64, 64).data);
			} finally {
				sample.close();
			}
		}

		expect(expected).toHaveLength(3);
		for (const muted of [true, false]) {
			let captured = 0;
			await renderMediaOnWeb({
				licenseKey: 'free-license',
				composition: {...composition, calculateMetadata: null},
				inputProps: {},
				container: 'mkv',
				videoCodec: 'vp8',
				audioCodec: 'pcm-s16',
				sampleRate: 48000,
				muted,
				onFrame: async (frame) => {
					expect(frame.timestamp).toBe(
						Math.round((captured / composition.fps) * 1_000_000),
					);
					const pixels = readFrame(frame);
					const reference = expected[captured % 3];
					const wrong = pixels.reduce(
						(count, value, index) => count + Number(value !== reference[index]),
						0,
					);

					await savePixels(
						`${composition.id}/${muted}/${captured}-actual`,
						pixels,
					);
					await savePixels(
						`${composition.id}/${muted}/${captured}-reference`,
						reference,
					);
					expect(wrong, `frame ${captured}, export muted=${muted}`).toBe(0);
					captured++;
					return frame;
				},
			});
			expect(captured).toBe(composition.durationInFrames);
		}
	},
);

test.each(['wav', 'mkv'] as const)(
	'exports nested fractional loops without phantom audio iterations in %s',
	async (container) => {
		const result = await renderMediaOnWeb({
			licenseKey: 'free-license',
			composition: {...fractionalNestedAudio, calculateMetadata: null},
			inputProps: {},
			container,
			videoCodec: 'vp8',
			audioCodec: 'pcm-s16',
			sampleRate: 48000,
		});
		await saveMedia(`nested-${container}`, await result.getBlob());
		using input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(await result.getBlob()),
		});
		const track = await input.getPrimaryAudioTrack();
		expect(track).not.toBeNull();
		let samples = 0;
		let wrong = 0;
		for await (const {buffer} of new AudioBufferSink(track!).buffers()) {
			for (let channel = 0; channel < 2; channel++) {
				const pcm = buffer.getChannelData(channel);
				for (let i = 0; i < pcm.length; i++) {
					const offset = (samples + i) % 800;
					const expected =
						Math.round(
							Math.sin(
								(offset / 48000) * (channel === 0 ? 440 : 660) * Math.PI * 2,
							) * 10000,
						) / 32768;
					if (pcm[i] !== expected) wrong++;
				}
			}

			samples += buffer.length;
		}

		expect(samples).toBe(8000);
		expect(wrong).toBe(0);
	},
);

test('does not load an unused visual asset during fractional audio passes', async () => {
	let captured = 0;
	const result = await renderMediaOnWeb({
		licenseKey: 'free-license',
		composition: {...fractionalUnusedImage, calculateMetadata: null},
		inputProps: {},
		container: 'mkv',
		videoCodec: 'vp8',
		audioCodec: 'pcm-s16',
		sampleRate: 48000,
		onFrame: async (frame) => {
			const pixels = readFrame(frame);
			let wrongPixels = 0;
			for (let i = 0; i < pixels.length; i++)
				if (pixels[i] !== [16, 40, 80, 255][i % 4]) wrongPixels++;
			await savePixels(`unused-image/${captured}-actual`, pixels);
			expect(wrongPixels).toBe(0);
			captured++;
			return frame;
		},
	});
	expect(captured).toBe(4);
	await saveMedia('unused-image', await result.getBlob());
	using input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(await result.getBlob()),
	});
	const track = await input.getPrimaryAudioTrack();
	expect(track).not.toBeNull();
	let samples = 0;
	let wrong = 0;
	for await (const {buffer} of new AudioBufferSink(track!).buffers()) {
		for (let channel = 0; channel < 2; channel++) {
			const pcm = buffer.getChannelData(channel);
			for (let i = 0; i < pcm.length; i++) {
				const absolute = samples + i;
				const expected =
					absolute >= 500 && absolute < 740
						? Math.round(
								Math.sin(
									((absolute - 500) / 48000) *
										(channel === 0 ? 440 : 660) *
										Math.PI *
										2,
								) * 10000,
							) / 32768
						: 0;
				if (pcm[i] !== expected) wrong++;
			}
		}

		samples += buffer.length;
	}

	expect(samples).toBe(8000);
	expect(wrong).toBe(0);
});

test.each(['wav', 'mkv'] as const)(
	'excludes roundoff-only final wraps in looping Sequences for %s',
	async (container) => {
		let captured = 0;
		let observedPass = 0;
		let lastTimestamp = -1;
		const options = {
			licenseKey: 'free-license' as const,
			composition: {...fractionalLoopingSequence, calculateMetadata: null},
			inputProps: {},
			container,
			videoCodec: 'vp8' as const,
			audioCodec: 'pcm-s16' as const,
			sampleRate: 48000,
			onFrame:
				container === 'mkv'
					? async (frame: VideoFrame) => {
							expect(frame.timestamp).toBe(
								Math.round((captured / 24) * 1_000_000),
							);
							const pixels = readFrame(frame);
							let wrongPixels = 0;
							for (let index = 0; index < pixels.length; index++)
								if (pixels[index] !== [16, 40, 80, 255][index % 4])
									wrongPixels++;

							if (frame.timestamp <= lastTimestamp) observedPass++;
							lastTimestamp = frame.timestamp;
							const label = `sequence-loop/${observedPass === 0 ? 'muted' : 'audio'}/${captured}`;
							await savePixels(label + '-actual', pixels);
							await server.commands.writeFile(
								`test/__results__/fractional-review/${server.browser}/${label}.json`,
								JSON.stringify({
									timestamp: frame.timestamp,
									width: frame.displayWidth,
									height: frame.displayHeight,
								}),
							);
							expect(wrongPixels).toBe(0);
							captured++;
							return frame;
						}
					: undefined,
		};
		if (container === 'mkv') {
			const mutedResult = await renderMediaOnWeb({...options, muted: true});
			await saveMedia('sequence-loop-muted', await mutedResult.getBlob());
			expect(captured).toBe(4);
			captured = 0;
		}

		const result = await renderMediaOnWeb(options);
		expect(captured).toBe(container === 'mkv' ? 4 : 0);
		await saveMedia(`sequence-loop-${container}`, await result.getBlob());
		using input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(await result.getBlob()),
		});
		const track = await input.getPrimaryAudioTrack();
		expect(track).not.toBeNull();
		let samples = 0;
		let wrong = 0;
		for await (const {buffer} of new AudioBufferSink(track!).buffers()) {
			for (let channel = 0; channel < 2; channel++) {
				const pcm = buffer.getChannelData(channel);
				for (let index = 0; index < pcm.length; index++) {
					const absolute = samples + index;
					const offset = (absolute - 500) % 1400;
					const expected =
						absolute >= 500 && absolute < 4700
							? Math.round(
									Math.sin(
										(offset / 48000) *
											(channel === 0 ? 440 : 660) *
											Math.PI *
											2,
									) * 10000,
								) / 32768
							: 0;
					if (pcm[index] !== expected) wrong++;
				}
			}

			samples += buffer.length;
		}

		expect(samples).toBe(8000);
		expect(wrong).toBe(0);
	},
);
