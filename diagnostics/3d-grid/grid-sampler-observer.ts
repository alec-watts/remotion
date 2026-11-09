import {vi} from 'vitest';

// Private diagnostic only: actual bound sampler state at draw time and its
// subsequent Canvas copy. Never read pixels or modify renderer state.
export const observeGridDraws = ({
	id,
	frame,
	experimental3DRendering,
	phase,
}: {
	id: string;
	frame: number;
	experimental3DRendering: boolean;
	phase: string;
}) => {
	const records: {
		draw: number[];
		min: number | null;
		mag: number | null;
		canvas: number[];
		drawingBuffer: number[];
		resolution: number[] | null;
		viewport: number[];
		copies: {destination: number[]; transform: number[]; target: number[]}[];
		diagnosticError: string | null;
	}[] = [];
	const byCanvas = new WeakMap<object, (typeof records)[number]>();
	const originalDraw = WebGLRenderingContext.prototype.drawArrays;
	const originalCopy = OffscreenCanvasRenderingContext2D.prototype.drawImage;
	const drawSpy = vi
		.spyOn(WebGLRenderingContext.prototype, 'drawArrays')
		.mockImplementation(function (this: WebGLRenderingContext, ...args) {
			const record: (typeof records)[number] = {
				draw: args,
				min: null,
				mag: null,
				canvas: [],
				drawingBuffer: [],
				resolution: null,
				viewport: [],
				copies: [],
				diagnosticError: null,
			};
			try {
				record.min = this.getTexParameter(
					this.TEXTURE_2D,
					this.TEXTURE_MIN_FILTER,
				) as number;
				record.mag = this.getTexParameter(
					this.TEXTURE_2D,
					this.TEXTURE_MAG_FILTER,
				) as number;
				record.canvas = [this.canvas.width, this.canvas.height];
				record.drawingBuffer = [
					this.drawingBufferWidth,
					this.drawingBufferHeight,
				];
				record.viewport = Array.from(
					this.getParameter(this.VIEWPORT) as Int32Array,
				);
				const program = this.getParameter(
					this.CURRENT_PROGRAM,
				) as WebGLProgram | null;
				const location =
					program === null
						? null
						: this.getUniformLocation(program, 'uResolution');
				record.resolution =
					program !== null && location !== null
						? Array.from(this.getUniform(program, location) as Float32Array)
						: null;
				byCanvas.set(this.canvas, record);
			} catch (error) {
				record.diagnosticError =
					error instanceof Error ? error.message : String(error);
			}

			records.push(record);
			return originalDraw.apply(this, args);
		});
	const copySpy = vi
		.spyOn(OffscreenCanvasRenderingContext2D.prototype, 'drawImage')
		.mockImplementation(function (
			this: OffscreenCanvasRenderingContext2D,
			...args: unknown[]
		) {
			try {
				const record = byCanvas.get(args[0] as object);
				if (record && args.length === 9)
					record.copies.push({
						destination: args.slice(5, 9) as number[],
						transform: Array.from(this.getTransform().toFloat64Array()),
						target: [this.canvas.width, this.canvas.height],
					});
			} catch (error) {
				const record = byCanvas.get(args[0] as object);
				if (record)
					record.diagnosticError =
						error instanceof Error ? error.message : String(error);
			}

			return Reflect.apply(originalCopy, this, args) as void;
		});
	return {
		id,
		frame,
		experimental3DRendering,
		phase,
		records,
		[Symbol.dispose]: () => {
			try {
				drawSpy.mockRestore();
			} finally {
				copySpy.mockRestore();
			}
		},
	};
};
