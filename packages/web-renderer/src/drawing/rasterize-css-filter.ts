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
	const sharpShadow =
		operations.length === 1
			? /^drop-shadow\((.*)\)$/i.exec(operations[0])
			: null;
	const shadow = sharpShadow ? parseCssDropShadow(sharpShadow[1], color) : null;
	const separateShadow =
		shadow?.blur === 0 &&
		Number.isInteger(shadow.x * rasterScale.x) &&
		Number.isInteger(shadow.y * rasterScale.y)
			? shadow
			: null;

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
	if (separateShadow) {
		// Rasterize the shadow in SVG while preserving the original source colors.
		const ns = 'http://www.w3.org/2000/svg';
		const offset = ownerDocument.createElementNS(ns, 'feOffset');
		offset.setAttribute('in', 'SourceAlpha');
		offset.setAttribute('dx', String(separateShadow.x * rasterScale.x));
		offset.setAttribute('dy', String(separateShadow.y * rasterScale.y));
		offset.setAttribute('result', 'shadow-alpha');
		const flood = ownerDocument.createElementNS(ns, 'feFlood');
		flood.setAttribute('flood-color', separateShadow.color);
		flood.setAttribute('result', 'shadow-color');
		const mask = ownerDocument.createElementNS(ns, 'feComposite');
		mask.setAttribute('in', 'shadow-color');
		mask.setAttribute('in2', 'shadow-alpha');
		mask.setAttribute('operator', 'in');
		resource.replaceChildren(offset, flood, mask);
	}

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
		if (!separateShadow) return image;
		const output = new OffscreenCanvas(source.width, source.height);
		const context = output.getContext('2d');
		if (!context) throw new Error('Could not create shadow context');
		context.drawImage(image, 0, 0);
		context.drawImage(source, 0, 0);
		return output;
	} finally {
		URL.revokeObjectURL(url);
	}
};
