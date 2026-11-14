import type {InternalState} from '../internal-state';
import type {MaskImageInfo} from './mask-image';
import {getRasterImageDataUrl, readBlobAsDataUrl} from './raster-image-loader';
import {turnSvgIntoDrawable} from './turn-svg-into-drawable';

export const createCssMask = async ({
	maskImageInfo,
	content,
	maskRect,
	precomposeRect,
	width,
	height,
	scale,
	internalState,
}: {
	maskImageInfo: Extract<MaskImageInfo, {type: 'layers'}>;
	content: OffscreenCanvas;
	maskRect: DOMRect;
	precomposeRect: DOMRect;
	width: number;
	height: number;
	scale: number;
	internalState: InternalState;
}) => {
	const images = await Promise.all(
		maskImageInfo.layers.map(async (layer) => {
			if (layer === null) return 'none';
			if (layer.type === 'linear-gradient') return layer.value;
			const src = await getRasterImageDataUrl({
				src: layer.src,
				sourceProperty: 'mask-image',
				state: internalState.rasterImageLoaderState,
			});
			return `url("${src}")`;
		}),
	);

	const source = document.createElement('img');
	const {signal} = internalState.rasterImageLoaderState;
	const abort = () => source.removeAttribute('src');
	signal?.addEventListener('abort', abort, {once: true});
	try {
		source.src = await readBlobAsDataUrl({
			blob: await content.convertToBlob({type: 'image/png'}),
			signal: internalState.rasterImageLoaderState.signal,
		});
		if (signal?.aborted) throw new Error('Aborted');
		await source.decode();
		if (signal?.aborted) throw new Error('Aborted');
		const namespace = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(namespace, 'svg');
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));
		// The canvas includes ceil-rounded raster padding. Preserve its exact
		// pixel mapping rather than stretching it to the unrounded CSS extent.
		svg.setAttribute('viewBox', `0 0 ${width / scale} ${height / scale}`);
		const target = document.createElementNS(namespace, 'svg');
		target.setAttribute('x', String(maskRect.left - precomposeRect.left));
		target.setAttribute('y', String(maskRect.top - precomposeRect.top));
		target.setAttribute('width', String(maskRect.width));
		target.setAttribute('height', String(maskRect.height));
		target.setAttribute('viewBox', `0 0 ${maskRect.width} ${maskRect.height}`);
		target.style.overflow = 'visible';
		const image = document.createElementNS(namespace, 'image');
		image.setAttribute('href', source.src);
		image.setAttribute('x', String(precomposeRect.left - maskRect.left));
		image.setAttribute('y', String(precomposeRect.top - maskRect.top));
		image.setAttribute('width', String(width / scale));
		image.setAttribute('height', String(height / scale));
		image.setAttribute('preserveAspectRatio', 'none');
		target.appendChild(image);
		svg.appendChild(target);
		Object.assign(target.style, maskImageInfo.style, {
			maskImage: images.join(', '),
			// HTML border-box coordinates correspond to this SVG viewport.
			maskOrigin: 'view-box',
			maskClip: 'view-box',
		});

		const drawable = await turnSvgIntoDrawable(svg);
		if (signal?.aborted) throw new Error('Aborted');
		return drawable;
	} finally {
		signal?.removeEventListener('abort', abort);
		source.removeAttribute('src');
	}
};
