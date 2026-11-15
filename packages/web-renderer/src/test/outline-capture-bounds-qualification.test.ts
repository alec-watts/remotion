import {expect, test} from 'vitest';
import {getBiggestBoundingClientRect} from '../get-biggest-bounding-client-rect';

test('capture bounds include only painted outline outsets', () => {
	const element = document.createElement('div');
	element.style.cssText =
		'position:fixed;left:10px;top:20px;width:30px;height:40px;outline-width:4px;outline-offset:7px';
	document.body.appendChild(element);
	try {
		for (const [style, expected] of [
			['none', [10, 20, 30, 40]],
			['solid', [-1, 9, 52, 62]],
		] as const) {
			element.style.outlineStyle = style;
			const rect = getBiggestBoundingClientRect(element);
			expect([rect.x, rect.y, rect.width, rect.height]).toEqual(expected);
			const layout = getBiggestBoundingClientRect(element, false);
			expect([layout.x, layout.y, layout.width, layout.height]).toEqual([
				10, 20, 30, 40,
			]);
		}
	} finally {
		element.remove();
	}
});
