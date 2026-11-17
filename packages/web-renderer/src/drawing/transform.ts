import {contextRasterScales} from './raster-scale';
export const setTransform = ({
	ctx,
	transform,
	parentRect,
	scale,
}: {
	ctx: OffscreenCanvasRenderingContext2D;
	transform: DOMMatrix;
	parentRect: DOMRect;
	scale: number;
}) => {
	const rasterScale = contextRasterScales.get(ctx) ?? {x: scale, y: scale};
	const offsetMatrix = new DOMMatrix()
		.scale(rasterScale.x, rasterScale.y)
		.translate(-parentRect.x, -parentRect.y)
		.multiply(transform)
		.translate(parentRect.x, parentRect.y);

	ctx.setTransform(offsetMatrix);

	return () => {
		ctx.setTransform(new DOMMatrix());
	};
};
