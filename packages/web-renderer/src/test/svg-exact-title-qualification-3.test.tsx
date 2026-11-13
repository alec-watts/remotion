import {test} from 'vitest';
import {qualifySvgExactTitle} from './qualify-svg-exact-title';
test.for([false, true])(
	'preserves exact title pair 3 with Roboto=%s',
	async (firstRoboto) => {
		await qualifySvgExactTitle({
			title: ' ',
			inactiveTitle: '\t',
			index: 3,
			firstRoboto,
		});
	},
);
