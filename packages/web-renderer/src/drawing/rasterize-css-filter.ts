import {splitAtTopLevel} from './background-image-rect';
import {createSvgFilterFromCss, parseCssDropShadow} from './css-filter-to-svg';
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
	const operations = splitAtTopLevel(filter, ' ');
	const match =
		operations.length === 1 ? /^drop-shadow\((.*)\)$/i.exec(filter) : null;
	const shadow = match ? parseCssDropShadow(match[1].trim(), color) : null;
	if (shadow?.blur === 0 && (shadow.x !== 0 || shadow.y !== 0)) {
		// A single Canvas draw can paint a sharp shadow and its source without
		// passing the source colors through an SVG filter image.
		const canvas = new OffscreenCanvas(source.width, source.height);
		const context = canvas.getContext('2d');
		try {
			if (!context) throw new Error('Could not create sharp shadow canvas');
			context.shadowColor = shadow.color;
			context.shadowOffsetX = shadow.x * rasterScale.x;
			context.shadowOffsetY = shadow.y * rasterScale.y;
			context.drawImage(source, 0, 0);
			return canvas;
		} catch (error) {
			canvas.width = 0;
			canvas.height = 0;
			throw error;
		}
	}

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
	const resource = createSvgFilterFromCss({
		filter,
		rasterScale,
		width: source.width,
		height: source.height,
		color,
		ownerDocument,
	});
	if (!resource) throw new Error(`Cannot rasterize CSS filter: ${filter}`);
	svg.appendChild(resource);
	const input = ownerDocument.createElementNS(
		'http://www.w3.org/2000/svg',
		'image',
	);
	input.setAttribute('width', String(source.width));
	input.setAttribute('height', String(source.height));
	input.setAttribute('href', 'data:image/png;base64,' + btoa(binary));
	input.setAttribute('filter', 'url(#' + resource.id + ')');
	svg.appendChild(input);
	const url = URL.createObjectURL(
		new Blob([new XMLSerializer().serializeToString(svg)], {
			type: 'image/svg+xml',
		}),
	);
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
		URL.revokeObjectURL(url);
	}
};
