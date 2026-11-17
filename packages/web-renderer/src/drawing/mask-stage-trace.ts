type MaskStage =
	| 'layer-source'
	| 'mask-input'
	| 'mask-raster'
	| 'layer-output'
	| 'projected-layer'
	| 'parent-after-copy';

type MaskStageObserver = (sample: {
	target: string;
	stage: MaskStage;
	width: number;
	height: number;
	geometry: Record<string, unknown>;
	png: Promise<Blob>;
}) => void;

let observer: MaskStageObserver | null = null;

export const setMaskStageObserver = (next: MaskStageObserver | null) => {
	observer = next;
};

export const traceMaskStage = (
	element: Element,
	stage: MaskStage,
	canvas: OffscreenCanvas,
	geometry: () => Record<string, unknown>,
) => {
	const target = observer && element.getAttribute('data-mask-stage');
	if (!target || !observer) {
		return;
	}

	// Snapshot while the canvas still holds this stage. The test awaits all
	// encodes after rendering so they do not add awaits to the drawing path.
	const png = new Promise<Blob>((resolve) => {
		resolve(canvas.convertToBlob({type: 'image/png'}));
	});
	png.catch(() => undefined);
	observer({
		target,
		stage,
		width: canvas.width,
		height: canvas.height,
		geometry: geometry(),
		png,
	});
};
