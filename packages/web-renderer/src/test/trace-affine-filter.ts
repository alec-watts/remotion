import {vi} from 'vitest';
import {server} from 'vitest/browser';

export const traceAffineFilter = async (
	path: string,
	render: () => Promise<Blob>,
) => {
	const original = OffscreenCanvasRenderingContext2D.prototype.drawImage;
	const events: unknown[] = [];
	const snapshots: {name: string; canvas: OffscreenCanvas}[] = [];
	const snapshot = (
		context: OffscreenCanvasRenderingContext2D,
		name: string,
	) => {
		const canvas = new OffscreenCanvas(
			context.canvas.width,
			context.canvas.height,
		);
		snapshots.push({name, canvas});
		const target = canvas.getContext('2d');
		if (!target) throw new Error('Could not snapshot filter stage');
		// Call the original method so this diagnostic never observes itself.
		original.call(
			target,
			context.canvas,
			0,
			0,
			context.canvas.width,
			context.canvas.height,
			0,
			0,
			canvas.width,
			canvas.height,
		);
	};

	const spy = vi
		.spyOn(OffscreenCanvasRenderingContext2D.prototype, 'drawImage')
		.mockImplementation(function (
			this: OffscreenCanvasRenderingContext2D,
			...args: Parameters<typeof original>
		) {
			const matrix = this.getTransform();
			const source = args[0];
			const filtered =
				typeof this.filter === 'string' && this.filter.includes('drop-shadow(');
			const index = events.length;
			events.push({
				index,
				width: this.canvas.width,
				height: this.canvas.height,
				filter: this.filter,
				composite: this.globalCompositeOperation,
				alpha: this.globalAlpha,
				smoothing: this.imageSmoothingEnabled,
				matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
				sourceKind: source.constructor.name,
				sourceWidth: 'width' in source ? source.width : null,
				sourceHeight: 'height' in source ? source.height : null,
				selfCopy: source === this.canvas,
				arguments: args.slice(1),
			});
			if (filtered) snapshot(this, `${index}-before-filter`);
			const result = original.apply(this, args);
			if (filtered) snapshot(this, `${index}-after-filter`);
			return result;
		});
	try {
		const output = await render();
		spy.mockRestore();
		await server.commands.writeFile(
			`${path}/draw-operations.json`,
			JSON.stringify(events),
		);
		for (const {name, canvas} of snapshots) {
			const blob = await canvas.convertToBlob({type: 'image/png'});
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${path}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		return output;
	} finally {
		spy.mockRestore();
		for (const {canvas} of snapshots) {
			canvas.width = 0;
			canvas.height = 0;
		}
	}
};
