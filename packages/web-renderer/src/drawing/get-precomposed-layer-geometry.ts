import type {RasterScale} from './raster-scale';
export const getPrecomposedLayerGeometry = ({
	precomposeRect,
	totalMatrix,
	parentRect,
	scale,
	is3DPrecomposition,
	rasterScale,
}: {
	precomposeRect: DOMRect;
	totalMatrix: DOMMatrix;
	parentRect: DOMRect;
	scale: number;
	is3DPrecomposition: boolean;
	rasterScale: RasterScale | null;
}) => {
	if (
		rasterScale &&
		(rasterScale.x !== rasterScale.y ||
			Math.abs(totalMatrix.a) !== Math.abs(totalMatrix.d) ||
			totalMatrix.a < 0 ||
			totalMatrix.d < 0) &&
		!is3DPrecomposition &&
		totalMatrix.b === 0 &&
		totalMatrix.c === 0 &&
		totalMatrix.a !== 0 &&
		totalMatrix.d !== 0
	) {
		const xScale = rasterScale.x * Math.abs(totalMatrix.a);
		const yScale = rasterScale.y * Math.abs(totalMatrix.d);
		const xs = [precomposeRect.left, precomposeRect.right].map(
			(x) => rasterScale.x * (totalMatrix.a * x + totalMatrix.e - parentRect.x),
		);
		const ys = [precomposeRect.top, precomposeRect.bottom].map(
			(y) => rasterScale.y * (totalMatrix.d * y + totalMatrix.f - parentRect.y),
		);
		const left = Math.floor(Math.min(...xs));
		const right = Math.ceil(Math.max(...xs));
		const top = Math.floor(Math.min(...ys));
		const bottom = Math.ceil(Math.max(...ys));
		const localXs = [left, right].map(
			(x) => (x / rasterScale.x - totalMatrix.e + parentRect.x) / totalMatrix.a,
		);
		const localYs = [top, bottom].map(
			(y) => (y / rasterScale.y - totalMatrix.f + parentRect.y) / totalMatrix.d,
		);
		return {
			rect: new DOMRect(
				Math.min(...localXs),
				Math.min(...localYs),
				(right - left) / xScale,
				(bottom - top) / yScale,
			),
			scale,
			rasterScale: {x: xScale, y: yScale},
			pixelWidth: right - left,
			pixelHeight: bottom - top,
		};
	}

	if (
		is3DPrecomposition ||
		totalMatrix.b !== 0 ||
		totalMatrix.c !== 0 ||
		!(totalMatrix.a > 0) ||
		totalMatrix.a !== totalMatrix.d
	) {
		return {
			rect: precomposeRect,
			scale,
			rasterScale: null,
			pixelWidth: null,
			pixelHeight: null,
		};
	}

	// If the layer is only scaled and translated when it is drawn (e.g. an
	// ancestor has `scale(0.9)`), rasterize it at that scale and align it to
	// the device pixel grid. Otherwise text would be rasterized at 1x and
	// resampled, shifting baselines and blurring edges.
	const layerScale = scale * totalMatrix.a;
	const deviceLeft = Math.floor(
		scale *
			(totalMatrix.a * precomposeRect.left + totalMatrix.e - parentRect.x),
	);
	const deviceTop = Math.floor(
		scale * (totalMatrix.d * precomposeRect.top + totalMatrix.f - parentRect.y),
	);
	const deviceRight = Math.ceil(
		scale *
			(totalMatrix.a * precomposeRect.right + totalMatrix.e - parentRect.x),
	);
	const deviceBottom = Math.ceil(
		scale *
			(totalMatrix.d * precomposeRect.bottom + totalMatrix.f - parentRect.y),
	);
	const pixelWidth = deviceRight - deviceLeft;
	const pixelHeight = deviceBottom - deviceTop;

	return {
		rect: new DOMRect(
			(deviceLeft / scale - totalMatrix.e + parentRect.x) / totalMatrix.a,
			(deviceTop / scale - totalMatrix.f + parentRect.y) / totalMatrix.d,
			pixelWidth / layerScale,
			pixelHeight / layerScale,
		),
		scale: layerScale,
		rasterScale: null,
		pixelWidth,
		pixelHeight,
	};
};
