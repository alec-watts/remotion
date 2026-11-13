export const getPrecomposedLayerGeometry = ({
	precomposeRect,
	totalMatrix,
	parentRect,
	scale,
	is3DPrecomposition,
	rasterizeFilterAtProjectedScale,
}: {
	precomposeRect: DOMRect;
	totalMatrix: DOMMatrix;
	parentRect: DOMRect;
	scale: number;
	is3DPrecomposition: boolean;
	rasterizeFilterAtProjectedScale: boolean | null;
}) => {
	if (
		is3DPrecomposition ||
		totalMatrix.b !== 0 ||
		totalMatrix.c !== 0 ||
		!(totalMatrix.a > 0) ||
		totalMatrix.a !== totalMatrix.d
	) {
		if (
			rasterizeFilterAtProjectedScale === true &&
			!is3DPrecomposition &&
			totalMatrix.b === 0 &&
			totalMatrix.c === 0 &&
			totalMatrix.a !== 0 &&
			totalMatrix.d !== 0
		) {
			const filterScale = Math.max(
				1,
				Math.abs(totalMatrix.a),
				Math.abs(totalMatrix.d),
			);
			const left = totalMatrix.a * precomposeRect.left + totalMatrix.e;
			const right = totalMatrix.a * precomposeRect.right + totalMatrix.e;
			const top = totalMatrix.d * precomposeRect.top + totalMatrix.f;
			const bottom = totalMatrix.d * precomposeRect.bottom + totalMatrix.f;
			const projectedPixelLeft = Math.floor(
				scale * (Math.min(left, right) - parentRect.x),
			);
			const projectedPixelRight = Math.ceil(
				scale * (Math.max(left, right) - parentRect.x),
			);
			const projectedPixelTop = Math.floor(
				scale * (Math.min(top, bottom) - parentRect.y),
			);
			const projectedPixelBottom = Math.ceil(
				scale * (Math.max(top, bottom) - parentRect.y),
			);
			const sourceX = [projectedPixelLeft, projectedPixelRight].map(
				(x) => (x / scale + parentRect.x - totalMatrix.e) / totalMatrix.a,
			);
			const sourceY = [projectedPixelTop, projectedPixelBottom].map(
				(y) => (y / scale + parentRect.y - totalMatrix.f) / totalMatrix.d,
			);
			return {
				rect: new DOMRect(
					Math.min(...sourceX),
					Math.min(...sourceY),
					Math.abs(sourceX[1] - sourceX[0]),
					Math.abs(sourceY[1] - sourceY[0]),
				),
				scale: scale * filterScale,
				pixelWidth:
					(projectedPixelRight - projectedPixelLeft) *
					(filterScale / Math.abs(totalMatrix.a)),
				pixelHeight:
					(projectedPixelBottom - projectedPixelTop) *
					(filterScale / Math.abs(totalMatrix.d)),
			};
		}

		return {
			rect: precomposeRect,
			scale,
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
		pixelWidth,
		pixelHeight,
	};
};
