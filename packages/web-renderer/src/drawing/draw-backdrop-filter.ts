import {parseBorderRadius} from './border-radius';
import {drawRoundedRectPath} from './draw-rounded';
import {scaleFilterLengths} from './handle-filter';

export const drawBackdropFilter = ({
	source,
	destination,
	filter,
	dimensions,
	layerRect,
	parentRect,
	totalMatrix,
	scale,
	layerScale,
	borderRadius,
}: {
	source: OffscreenCanvas;
	destination: OffscreenCanvasRenderingContext2D;
	filter: string;
	dimensions: DOMRect;
	layerRect: DOMRect;
	parentRect: DOMRect;
	totalMatrix: DOMMatrix;
	scale: number;
	layerScale: number;
	borderRadius: string;
}) => {
	if (!totalMatrix.is2D || filter.includes('url(')) return;
	const inverse = totalMatrix.inverse();
	if (!Number.isFinite(inverse.a)) return;

	const backdrop = new OffscreenCanvas(source.width, source.height);
	using _backdrop = {
		[Symbol.dispose]: () => {
			backdrop.width = 0;
			backdrop.height = 0;
		},
	};
	const backdropContext = backdrop.getContext('2d');
	if (!backdropContext || typeof backdropContext.filter !== 'string') return;
	backdropContext.filter = scaleFilterLengths(filter, scale);
	if (backdropContext.filter === 'none') return;
	backdropContext.drawImage(source, 0, 0);

	// Filter the painted backdrop in the parent bitmap's coordinate system.
	// Map it back to the element's group before applying group opacity or effects.
	const parentToLayer = new DOMMatrix()
		.scale(layerScale)
		.translate(-layerRect.left, -layerRect.top)
		.multiply(inverse)
		.translate(parentRect.left, parentRect.top)
		.scale(1 / scale);

	destination.save();
	try {
		destination.setTransform(layerScale, 0, 0, layerScale, 0, 0);
		drawRoundedRectPath({
			ctx: destination,
			x: dimensions.left - layerRect.left,
			y: dimensions.top - layerRect.top,
			width: dimensions.width,
			height: dimensions.height,
			borderRadius: parseBorderRadius({
				borderRadius,
				width: dimensions.width,
				height: dimensions.height,
			}),
		});
		destination.clip();
		destination.setTransform(parentToLayer);
		destination.globalAlpha = 1;
		destination.globalCompositeOperation = 'destination-over';
		destination.filter = 'none';
		destination.drawImage(backdrop, 0, 0);
	} finally {
		destination.restore();
	}
};
