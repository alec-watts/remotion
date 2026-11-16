import type {RasterScale} from './raster-scale';

export const rasterizeCssFilter = async ({
	source,
	filter,
	rasterScale,
	color,
	ownerDocument,
	signal,
}: {
	source: OffscreenCanvas;
	filter: string;
	rasterScale: RasterScale;
	color: string;
	ownerDocument: Document;
	signal: AbortSignal | null;
}) => {
	signal?.throwIfAborted();
	const blob = await source.convertToBlob({type: 'image/png'});
	signal?.throwIfAborted();
	const bytes = new Uint8Array(await blob.arrayBuffer());
	signal?.throwIfAborted();
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	const svg = ownerDocument.createElementNS(
		'http://www.w3.org/2000/svg',
		'svg',
	);
	svg.setAttribute('width', String(source.width));
	svg.setAttribute('height', String(source.height));
	const width = source.width / rasterScale.x;
	const height = source.height / rasterScale.y;
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	const foreignObject = ownerDocument.createElementNS(
		'http://www.w3.org/2000/svg',
		'foreignObject',
	);
	foreignObject.setAttribute('width', String(width));
	foreignObject.setAttribute('height', String(height));
	const input = ownerDocument.createElementNS(
		'http://www.w3.org/1999/xhtml',
		'img',
	);
	input.setAttribute('src', 'data:image/png;base64,' + btoa(binary));
	input.setAttribute(
		'style',
		`display:block;width:${width}px;height:${height}px;filter:${filter};color:${color}`,
	);
	foreignObject.appendChild(input);
	svg.appendChild(foreignObject);
	const url =
		'data:image/svg+xml;charset=utf-8,' +
		encodeURIComponent(new XMLSerializer().serializeToString(svg));

	const image = ownerDocument.createElement('img');
	try {
		await new Promise<void>((resolve, reject) => {
			function cleanup() {
				image.onload = null;
				image.onerror = null;
			}

			function cancel() {
				cleanup();
				image.src = '';
				reject(
					signal?.reason ?? new Error('CSS filter rasterization was cancelled'),
				);
			}

			image.onload = () => {
				cleanup();
				signal?.removeEventListener('abort', cancel);
				resolve();
			};

			image.onerror = () => {
				cleanup();
				signal?.removeEventListener('abort', cancel);
				reject(new Error('Failed to decode CSS filter raster'));
			};

			if (signal?.aborted) {
				cancel();
				return;
			}

			signal?.addEventListener('abort', cancel, {once: true});
			image.src = url;
		});
		signal?.throwIfAborted();
		return image;
	} finally {
		image.onload = null;
		image.onerror = null;
	}
};
