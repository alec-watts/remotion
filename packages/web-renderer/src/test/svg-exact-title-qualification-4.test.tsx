import {test} from 'vitest';
import {qualifySvgExactTitle} from './qualify-svg-exact-title';
test.for([false, true])(
	'preserves exact title pair 4 with Roboto=%s',
	async (firstRoboto) => {
		await qualifySvgExactTitle({
			title: '\u00c5',
			inactiveTitle: '\u00e5',
			index: 4,
			firstRoboto,
		});
	},
);
