export const getPrecomposedLayerGeometry = ({
	precomposeRect,
	totalMatrix,
	parentRect,
	scale,
	is3DPrecomposition,
}: {
	precomposeRect: DOMRect;
	totalMatrix: DOMMatrix;
	parentRect: DOMRect;
	scale: number;
	is3DPrecomposition: boolean;
}) => {
	if (
		is3DPrecomposition ||
		totalMatrix.b !== 0 ||
		totalMatrix.c !== 0 ||
		!(Math.abs(totalMatrix.a) > 0) ||
		Math.abs(totalMatrix.a) !== Math.abs(totalMatrix.d)
	) {
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
	const layerScale = scale * Math.abs(totalMatrix.a);
	const deviceLeft = Math.floor(
		scale *
			(totalMatrix.a *
				(totalMatrix.a > 0 ? precomposeRect.left : precomposeRect.right) +
				totalMatrix.e -
				parentRect.x),
	);
	const deviceTop = Math.floor(
		scale *
			(totalMatrix.d *
				(totalMatrix.d > 0 ? precomposeRect.top : precomposeRect.bottom) +
				totalMatrix.f -
				parentRect.y),
	);
	const deviceRight = Math.ceil(
		scale *
			(totalMatrix.a *
				(totalMatrix.a > 0 ? precomposeRect.right : precomposeRect.left) +
				totalMatrix.e -
				parentRect.x),
	);
	const deviceBottom = Math.ceil(
		scale *
			(totalMatrix.d *
				(totalMatrix.d > 0 ? precomposeRect.bottom : precomposeRect.top) +
				totalMatrix.f -
				parentRect.y),
	);
	const pixelWidth = deviceRight - deviceLeft;
	const pixelHeight = deviceBottom - deviceTop;

	return {
		rect: new DOMRect(
			((totalMatrix.a > 0 ? deviceLeft : deviceRight) / scale -
				totalMatrix.e +
				parentRect.x) /
				totalMatrix.a,
			((totalMatrix.d > 0 ? deviceTop : deviceBottom) / scale -
				totalMatrix.f +
				parentRect.y) /
				totalMatrix.d,
			pixelWidth / layerScale,
			pixelHeight / layerScale,
		),
		scale: layerScale,
		pixelWidth,
		pixelHeight,
	};
};
