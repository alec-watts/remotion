import {splitAtTopLevel} from './background-image-rect';
import type {RasterScale} from './raster-scale';

export const parseCssDropShadow = (value: string, color: string) => {
	const parts = splitAtTopLevel(value, ' ');
	const isLength = (part: string) =>
		/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i.test(part);
	const lengths = parts.filter(isLength).map(Number.parseFloat);
	if (lengths.length < 2 || lengths.length > 3) return null;
	return {
		x: lengths[0],
		y: lengths[1],
		blur: lengths[2] ?? 0,
		color: (parts.filter((part) => !isLength(part)).join(' ') || color).replace(
			/\bcurrentcolor\b/gi,
			color,
		),
	};
};

export const createSvgFilterFromCss = ({
	filter,
	width,
	height,
	color,
	ownerDocument,
	rasterScale,
}: {
	filter: string;
	width: number;
	height: number;
	color: string;
	ownerDocument: Document;
	rasterScale: RasterScale;
}): SVGFilterElement | null => {
	const resource = ownerDocument.createElementNS(
		'http://www.w3.org/2000/svg',
		'filter',
	);
	resource.id = 'remotion-css-filter';
	resource.setAttribute('filterUnits', 'userSpaceOnUse');
	resource.setAttribute('x', '0');
	resource.setAttribute('y', '0');
	resource.setAttribute('width', String(width));
	resource.setAttribute('height', String(height));
	resource.setAttribute('color-interpolation-filters', 'sRGB');
	for (const operation of splitAtTopLevel(filter, ' ')) {
		const match = /^([a-z-]+)\((.*)\)$/i.exec(operation);
		if (!match) return null;
		const name = match[1];
		const value = match[2].trim();
		const amount =
			value.trim() === ''
				? 1
				: parseFloat(value) / (value.trim().endsWith('%') ? 100 : 1);
		let primitive: SVGElement;
		if (name === 'blur') {
			primitive = ownerDocument.createElementNS(
				'http://www.w3.org/2000/svg',
				'feGaussianBlur',
			);
			primitive.setAttribute(
				'stdDeviation',
				`${(value.trim() === '' ? 0 : amount) * rasterScale.x} ${(value.trim() === '' ? 0 : amount) * rasterScale.y}`,
			);
			primitive.setAttribute('edgeMode', 'none');
		} else if (name === 'drop-shadow') {
			const shadow = parseCssDropShadow(value, color);
			if (!shadow) return null;
			primitive = ownerDocument.createElementNS(
				'http://www.w3.org/2000/svg',
				'feDropShadow',
			);
			primitive.setAttribute('dx', String(shadow.x * rasterScale.x));
			primitive.setAttribute('dy', String(shadow.y * rasterScale.y));
			primitive.setAttribute(
				'stdDeviation',
				`${shadow.blur * rasterScale.x} ${shadow.blur * rasterScale.y}`,
			);
			primitive.setAttribute('flood-color', shadow.color);
		} else if (
			name === 'saturate' ||
			name === 'hue-rotate' ||
			name === 'grayscale' ||
			name === 'sepia'
		) {
			primitive = ownerDocument.createElementNS(
				'http://www.w3.org/2000/svg',
				'feColorMatrix',
			);
			if (name === 'saturate') {
				primitive.setAttribute('type', 'saturate');
				primitive.setAttribute('values', String(amount));
			} else if (name === 'hue-rotate') {
				const angle = value.trim() === '' ? 0 : parseFloat(value);
				const factor = value.endsWith('grad')
					? 0.9
					: value.endsWith('rad')
						? 180 / Math.PI
						: value.endsWith('turn')
							? 360
							: 1;
				primitive.setAttribute('type', 'hueRotate');
				primitive.setAttribute('values', String(angle * factor));
			} else {
				const mix = Math.min(amount, 1);
				const matrix =
					name === 'grayscale'
						? [
								[0.2126, 0.7152, 0.0722],
								[0.2126, 0.7152, 0.0722],
								[0.2126, 0.7152, 0.0722],
							]
						: [
								[0.393, 0.769, 0.189],
								[0.349, 0.686, 0.168],
								[0.272, 0.534, 0.131],
							];
				const values = matrix.flatMap((row, y) => [
					...row.map(
						(coefficient, x) => mix * coefficient + (x === y ? 1 - mix : 0),
					),
					0,
					0,
				]);
				values.push(0, 0, 0, 1, 0);
				primitive.setAttribute('type', 'matrix');
				primitive.setAttribute('values', values.join(' '));
			}
		} else if (
			name === 'brightness' ||
			name === 'contrast' ||
			name === 'invert' ||
			name === 'opacity'
		) {
			primitive = ownerDocument.createElementNS(
				'http://www.w3.org/2000/svg',
				'feComponentTransfer',
			);
			for (const channel of name === 'opacity' ? ['A'] : ['R', 'G', 'B']) {
				const transfer = ownerDocument.createElementNS(
					'http://www.w3.org/2000/svg',
					'feFunc' + channel,
				);
				if (name === 'invert' || name === 'opacity') {
					const bounded = Math.min(amount, 1);
					transfer.setAttribute('type', 'table');
					transfer.setAttribute(
						'tableValues',
						name === 'opacity' ? '0 ' + bounded : bounded + ' ' + (1 - bounded),
					);
				} else {
					transfer.setAttribute('type', 'linear');
					transfer.setAttribute('slope', String(amount));
					transfer.setAttribute(
						'intercept',
						String(name === 'contrast' ? 0.5 * (1 - amount) : 0),
					);
				}

				primitive.appendChild(transfer);
			}
		} else {
			return null;
		}

		resource.appendChild(primitive);
	}

	return resource;
};
