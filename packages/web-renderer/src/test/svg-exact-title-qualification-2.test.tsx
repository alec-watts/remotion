import {test} from 'vitest';
import {qualifySvgExactTitle} from './qualify-svg-exact-title';
test.for([false, true])(
	'preserves exact title pair 2 with Roboto=%s',
	async (firstRoboto) => {
		await qualifySvgExactTitle({
			title: 'A ',
			inactiveTitle: ' A',
			index: 2,
			firstRoboto,
		});
	},
);
