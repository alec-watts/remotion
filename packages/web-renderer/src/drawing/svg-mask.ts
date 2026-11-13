import {parseUrlFunction} from './mask-image';
import {
	getSvgFontSnapshot,
	turnSvgIntoDrawable,
} from './turn-svg-into-drawable';

export type SvgResourceMaskImageInfo = {
	type: 'svg-resource';
	svg: SVGSVGElement;
	id: string;
	fontSnapshot: ReturnType<typeof getSvgFontSnapshot>;
};

export const getSvgResourceMask = (
	value: string,
	element: Element,
	style: CSSStyleDeclaration,
): SvgResourceMaskImageInfo | null => {
	if (!(element instanceof SVGSVGElement)) return null;
	const source = parseUrlFunction(value);
	if (source === null) return null;
	let id: string;
	try {
		const reference = new URL(source, element.baseURI);
		const documentUrl = new URL(element.ownerDocument.URL);
		id = decodeURIComponent(reference.hash.slice(1));
		reference.hash = '';
		documentUrl.hash = '';
		if (reference.href !== documentUrl.href || !id) return null;
	} catch {
		return null;
	}

	const resource = element.getElementById(id);
	if (
		resource?.namespaceURI !== 'http://www.w3.org/2000/svg' ||
		resource.localName !== 'mask'
	)
		return null;
	const fontSnapshot = getSvgFontSnapshot(element);
	// Capture before the composer neutralizes mask/filter/group properties.
	const svg = element.cloneNode(true) as SVGSVGElement;
	for (const property of ['width', 'height', 'fill', 'color'])
		svg.style.setProperty(property, style.getPropertyValue(property));

	return {type: 'svg-resource', svg, id, fontSnapshot};
};

export const createSvgResourceMask = ({
	svg,
	id,
	fontSnapshot,
}: SvgResourceMaskImageInfo) => {
	const white = svg.ownerDocument.createElementNS(
		'http://www.w3.org/2000/svg',
		'rect',
	);
	const viewBox = svg.viewBox.baseVal;
	white.setAttribute('x', String(viewBox.width ? viewBox.x : 0));
	white.setAttribute('y', String(viewBox.height ? viewBox.y : 0));
	white.setAttribute('width', viewBox.width ? String(viewBox.width) : '100%');
	white.setAttribute(
		'height',
		viewBox.height ? String(viewBox.height) : '100%',
	);
	for (const [property, value] of [
		['fill', 'white'],
		['display', 'inline'],
		['visibility', 'visible'],
		['transform', 'none'],
		['stroke', 'none'],
		['filter', 'none'],
		['mask', 'none'],
		['clip-path', 'none'],
		['opacity', '1'],
		['mix-blend-mode', 'normal'],
	])
		white.style.setProperty(property, value, 'important');

	svg.appendChild(white);
	for (const [property, value] of [
		['mask-image', `url("#${encodeURIComponent(id)}")`],
		['-webkit-mask-image', `url("#${encodeURIComponent(id)}")`],
		['clip-path', 'none'],
		['filter', 'none'],
		['mix-blend-mode', 'normal'],
		['opacity', '1'],
	])
		svg.style.setProperty(property, value, 'important');

	return turnSvgIntoDrawable(svg, {
		...fontSnapshot,
		authoredStyles:
			fontSnapshot.authoredStyles === null
				? null
				: [...fontSnapshot.authoredStyles, white.getAttribute('style')],
		authoredMedia:
			fontSnapshot.authoredMedia === null
				? null
				: [...fontSnapshot.authoredMedia, null],
		authoredEmpty:
			fontSnapshot.authoredEmpty === null
				? null
				: [...fontSnapshot.authoredEmpty, true],
	});
};
