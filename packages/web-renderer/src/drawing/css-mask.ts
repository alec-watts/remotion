import type {InternalState} from '../internal-state';
import type {MaskImageInfo} from './mask-image';
import {createNativeMaskSvg} from './native-mask-svg';
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

	const alphaOnly =
		!Number.isInteger(scale) &&
		Math.abs(precomposeRect.width * scale - width) <= width * Number.EPSILON &&
		Math.abs(precomposeRect.height * scale - height) <= height * Number.EPSILON;
	const image = alphaOnly ? null : document.createElement('img');
	const source = image ?? document.createElement('div');
	const {signal} = internalState.rasterImageLoaderState;
	const abort = () => image?.removeAttribute('src');
	signal?.addEventListener('abort', abort, {once: true});
	try {
		if (image) {
			image.src = await readBlobAsDataUrl({
				blob: await content.convertToBlob({type: 'image/png'}),
				signal,
			});
			if (signal?.aborted) throw new Error('Aborted');
			await image.decode();
		} else {
			source.style.backgroundColor = 'white';
		}

		if (signal?.aborted) throw new Error('Aborted');
		Object.assign(source.style, {
			position: 'absolute',
			left: `${precomposeRect.left - maskRect.left}px`,
			top: `${precomposeRect.top - maskRect.top}px`,
			width: `${precomposeRect.width}px`,
			height: `${precomposeRect.height}px`,
		});
		const {svg, target, foreignObject, viewport} = createNativeMaskSvg({
			ownerDocument: document,
			maskRect,
			precomposeRect,
			referenceRect: maskRect,
			width,
			height,
		});
		if (width !== precomposeRect.width || height !== precomposeRect.height) {
			// Keep CSS mask lengths in the layout box's coordinate space. Size
			// the SVG viewport in device pixels and project the HTML box once.
			svg.removeAttribute('viewBox');
			foreignObject.setAttribute('width', String(width));
			foreignObject.setAttribute('height', String(height));
			const scaleX = width / precomposeRect.width;
			const scaleY = height / precomposeRect.height;
			viewport.style.transformOrigin = '0 0';
			if (alphaOnly) {
				// Keep the mask in layout coordinates and shift the scaled
				// viewport to the capture origin after layout.
				target.style.left = `${maskRect.left}px`;
				target.style.top = `${maskRect.top}px`;
				viewport.style.transform = `translate(${-precomposeRect.left * scale}px, ${-precomposeRect.top * scale}px) scale(${scale})`;
			} else {
				viewport.style.transform = `scale(${scaleX}, ${scaleY})`;
			}
		}

		target.replaceChildren(source);
		Object.assign(target.style, maskImageInfo.style, {
			maskImage: images.join(', '),
		});

		const drawable = await turnSvgIntoDrawable(svg);
		if (signal?.aborted) throw new Error('Aborted');
		return {drawable, alphaOnly};
	} finally {
		signal?.removeEventListener('abort', abort);
		image?.removeAttribute('src');
	}
};
