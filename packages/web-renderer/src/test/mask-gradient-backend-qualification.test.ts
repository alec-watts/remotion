import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';

const cases = (['default', 'readback', 'no-readback'] as const).flatMap(
	(context) =>
		(['gradient', 'gradient-endpoints', 'rectangles'] as const).map(
			(paint) => ({context, paint}),
		),
);

test.for(cases)(
	'preserves hard gradient colors with $context context and $paint paint',
	async ({context, paint}) => {
		const canvas = new OffscreenCanvas(212, 92);
		const readback = new OffscreenCanvas(212, 92);
		using _cleanup = {
			[Symbol.dispose]: () => {
				canvas.width = 0;
				canvas.height = 0;
				readback.width = 0;
				readback.height = 0;
			},
		};
		const ctx = canvas.getContext(
			'2d',
			context === 'default' ? {} : {willReadFrequently: context === 'readback'},
		);
		if (!ctx) throw new Error('Could not create gradient context');
		const getAttributes: unknown = Reflect.get(ctx, 'getContextAttributes');
		const attributes =
			typeof getAttributes === 'function'
				? Reflect.apply(getAttributes, ctx, [])
				: null;
		ctx.scale(2, 2);
		ctx.translate(3, 3);
		if (paint === 'rectangles') {
			ctx.fillStyle = 'blue';
			ctx.fillRect(0, 0, 50, 40);
			ctx.fillStyle = 'red';
			ctx.fillRect(50, 0, 50, 40);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 100, 0);
			if (paint === 'gradient-endpoints') gradient.addColorStop(0, 'blue');
			gradient.addColorStop(0.5, 'blue');
			gradient.addColorStop(0.5, 'red');
			if (paint === 'gradient-endpoints') gradient.addColorStop(1, 'red');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, 100, 40);
		}

		const blob = await canvas.convertToBlob({type: 'image/png'});
		const bitmap = await createImageBitmap(blob);
		using _bitmap = {[Symbol.dispose]: () => bitmap.close()};
		const reader = readback.getContext('2d', {willReadFrequently: true});
		if (!reader) throw new Error('Could not create pixel reader');
		reader.drawImage(bitmap, 0, 0);
		const {data} = reader.getImageData(0, 0, 212, 92);
		let wrong = 0;
		for (let y = 0; y < 92; y++)
			for (let x = 0; x < 212; x++) {
				const inside = x >= 6 && x < 206 && y >= 6 && y < 86;
				const blue = x < 106;
				const expected = [
					inside && !blue ? 255 : 0,
					0,
					inside && blue ? 255 : 0,
					inside ? 255 : 0,
				];
				const offset = (y * 212 + x) * 4;
				if (expected.some((value, index) => data[offset + index] !== value))
					wrong++;
			}

		const prefix = `test/__results__/mask-gradient-backend/${server.browser}/${context}-${paint}`;
		let binary = '';
		for (const byte of new Uint8Array(await blob.arrayBuffer()))
			binary += String.fromCharCode(byte);
		await server.commands.writeFile(`${prefix}.png`, btoa(binary), 'base64');
		await server.commands.writeFile(
			`${prefix}.json`,
			JSON.stringify({
				context,
				paint,
				attributes,
				wrong,
				userAgent: navigator.userAgent,
				devicePixelRatio,
				width: 212,
				height: 92,
			}),
		);
		expect(wrong).toBe(0);
	},
);
