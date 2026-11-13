import {parseUrlFunction} from './mask-image';
import {
	getSvgFontSnapshot,
	turnSvgIntoDrawable,
} from './turn-svg-into-drawable';

export type SvgResourceMaskImageInfo = {
	type: 'svg-resource';
	svg: SVGSVGElement;
	id: string;
	referenceBox: DOMRect;
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

	return {
		type: 'svg-resource',
		svg,
		id,
		fontSnapshot,
		referenceBox: element.getBBox(),
	};
};

export const createSvgResourceMask = (
	{svg, id, referenceBox, fontSnapshot}: SvgResourceMaskImageInfo,
	rasterSize: {width: number; height: number},
) => {
	const white = svg.ownerDocument.createElementNS(
		'http://www.w3.org/2000/svg',
		'rect',
	);
	const viewBox = svg.viewBox.baseVal;
	const coverId = `remotion-mask-cover-${crypto.randomUUID()}`;
	const namespace = 'http://www.w3.org/2000/svg';
	const defs = svg.ownerDocument.createElementNS(namespace, 'defs');
	const cover = svg.ownerDocument.createElementNS(namespace, 'filter');
	cover.id = coverId;
	cover.setAttribute('filterUnits', 'userSpaceOnUse');
	cover.setAttribute('x', String(viewBox.width ? viewBox.x : 0));
	cover.setAttribute('y', String(viewBox.height ? viewBox.y : 0));
	cover.setAttribute('width', viewBox.width ? String(viewBox.width) : '100%');
	cover.setAttribute(
		'height',
		viewBox.height ? String(viewBox.height) : '100%',
	);
	const flood = svg.ownerDocument.createElementNS(namespace, 'feFlood');
	flood.style.setProperty('flood-color', 'white', 'important');
	flood.style.setProperty('flood-opacity', '1', 'important');
	cover.appendChild(flood);
	defs.appendChild(cover);
	// A filter can paint the capture viewport without enlarging the geometry
	// used by objectBoundingBox masks on the original SVG root.
	for (const property of ['x', 'y', 'width', 'height'] as const) {
		white.setAttribute(property, String(referenceBox[property]));
		white.style.setProperty(
			property,
			`${referenceBox[property]}px`,
			'important',
		);
	}

	for (const [property, value] of [
		['fill', 'white'],
		['display', 'inline'],
		['visibility', 'visible'],
		['transform', 'none'],
		['stroke', 'none'],
		['filter', `url("#${coverId}")`],
		['mask', 'none'],
		['clip-path', 'none'],
		['opacity', '1'],
		['mix-blend-mode', 'normal'],
	])
		white.style.setProperty(property, value, 'important');

	svg.appendChild(defs);
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

	// Preserve the SVG user-space viewport while decoding at the actual layer
	// density, avoiding a second bitmap enlargement for transformed masks.
	const viewportWidth = Number.parseFloat(svg.style.width);
	const viewportHeight = Number.parseFloat(svg.style.height);
	if (!svg.hasAttribute('viewBox')) {
		svg.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
	}

	svg.setAttribute('width', String(rasterSize.width));
	svg.setAttribute('height', String(rasterSize.height));
	svg.style.setProperty('width', `${rasterSize.width}px`, 'important');
	svg.style.setProperty('height', `${rasterSize.height}px`, 'important');

	const additions = [defs, cover, flood, white];
	return turnSvgIntoDrawable(svg, {
		...fontSnapshot,
		authoredStyles:
			fontSnapshot.authoredStyles === null
				? null
				: [
						...fontSnapshot.authoredStyles,
						...additions.map((element) => element.getAttribute('style')),
					],
		authoredMedia:
			fontSnapshot.authoredMedia === null
				? null
				: [...fontSnapshot.authoredMedia, ...additions.map(() => null)],
		authoredEmpty:
			fontSnapshot.authoredEmpty === null
				? null
				: [
						...fontSnapshot.authoredEmpty,
						...additions.map((element) => element.matches(':empty')),
					],
	});
};
