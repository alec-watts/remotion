export type RasterScale = {x: number; y: number};

export const contextRasterScales = new WeakMap<
	OffscreenCanvasRenderingContext2D,
	RasterScale
>();
