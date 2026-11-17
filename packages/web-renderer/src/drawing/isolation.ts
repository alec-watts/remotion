import {getMaskImageValue} from './mask-image';

export const getBackdropFilter = (style: CSSStyleDeclaration) => {
	const filter =
		style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
	return filter && filter !== 'none' ? filter : null;
};

const backdropRootProperties = new Set([
	'opacity',
	'filter',
	'backdrop-filter',
	'clip-path',
	'mask',
	'mask-image',
	'mask-border',
	'mix-blend-mode',
]);

const createsBackdropRoot = (style: CSSStyleDeclaration) =>
	style.display !== 'contents' &&
	(parseFloat(style.opacity) < 1 ||
		style.filter !== 'none' ||
		getBackdropFilter(style) !== null ||
		style.clipPath !== 'none' ||
		getMaskImageValue(style) !== null ||
		style.mixBlendMode !== 'normal' ||
		style.willChange
			.split(',')
			.some((value) => backdropRootProperties.has(value.trim())));

const willChangeStackingContextProperties = new Set([
	'opacity',
	'transform',
	'translate',
	'scale',
	'rotate',
	'perspective',
	'filter',
	'backdrop-filter',
	'clip-path',
	'mask',
	'mask-image',
	'mix-blend-mode',
	'isolation',
	'z-index',
	'position',
	'contain',
]);

// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context#features_creating_stacking_contexts
// Every stacking context is an isolated group for mix-blend-mode.
export const createsStackingContext = (element: Element) => {
	const style = getComputedStyle(element);

	// display: contents has no box, so its children participate directly in
	// the ancestor's stacking context even if these properties are specified.
	if (style.display === 'contents') return false;

	if (style.zIndex !== 'auto') {
		if (style.position !== 'static') {
			return true;
		}

		const parentDisplay = element.parentElement
			? getComputedStyle(element.parentElement).display
			: '';
		if (parentDisplay.includes('flex') || parentDisplay.includes('grid')) {
			return true;
		}
	}

	return (
		style.position === 'fixed' ||
		style.position === 'sticky' ||
		parseFloat(style.opacity) < 1 ||
		style.transform !== 'none' ||
		style.translate !== 'none' ||
		style.scale !== 'none' ||
		style.rotate !== 'none' ||
		style.perspective !== 'none' ||
		style.transformStyle === 'preserve-3d' ||
		style.filter !== 'none' ||
		getBackdropFilter(style) !== null ||
		style.clipPath !== 'none' ||
		getMaskImageValue(style) !== null ||
		style.isolation === 'isolate' ||
		style.mixBlendMode !== 'normal' ||
		/\b(paint|layout|strict|content)\b/.test(style.contain) ||
		style.willChange
			.split(',')
			.some((value) => willChangeStackingContextProperties.has(value.trim()))
	);
};

// An element with mix-blend-mode only blends with the content of the
// nearest ancestor stacking context.
export const getElementsNeedingIsolation = ({
	rootElement,
	acceptNode,
}: {
	rootElement: HTMLElement | SVGElement;
	acceptNode: (node: Node) => number;
}) => {
	const isolatedElements = new WeakSet<Element>();
	const treeWalker = document.createTreeWalker(
		rootElement,
		NodeFilter.SHOW_ELEMENT,
		acceptNode,
	);

	while (treeWalker.nextNode()) {
		const element = treeWalker.currentNode as Element;
		const style = getComputedStyle(element);
		let needsBackdropRoot = getBackdropFilter(style) !== null;
		let needsBlendContext = style.mixBlendMode !== 'normal';

		let ancestor = element.parentElement;
		while (
			(needsBackdropRoot || needsBlendContext) &&
			ancestor &&
			ancestor !== rootElement
		) {
			if (
				needsBackdropRoot &&
				createsBackdropRoot(getComputedStyle(ancestor))
			) {
				isolatedElements.add(ancestor);
				needsBackdropRoot = false;
			}

			if (needsBlendContext && createsStackingContext(ancestor)) {
				isolatedElements.add(ancestor);
				needsBlendContext = false;
			}

			ancestor = ancestor.parentElement;
		}
	}

	return isolatedElements;
};
