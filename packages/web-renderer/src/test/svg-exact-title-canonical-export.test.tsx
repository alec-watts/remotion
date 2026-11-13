import {expect, test} from 'vitest';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {svgExactTitleFont} from './fixtures/svg-exact-title-font';
import {countNativePixels} from './native-reference';

test('retains strict canonical-title pixel comparison', async () => {
	const options = {title: 'A', firstRoboto: false, literal: false};
	const render = async (inactiveTitle: string) => {
		const result = await renderStillOnWeb({
			licenseKey: 'free-license',
			composition: svgExactTitleFont({...options, inactiveTitle}),
			frame: 0,
			inputProps: {},
			allowHtmlInCanvas: false,
		});
		return result.blob({format: 'png'});
	};

	const actual = await render(' A ');
	const expected = await render('B');
	expect((await countNativePixels(expected, actual)).mismatchedPixels).toBe(0);
});
