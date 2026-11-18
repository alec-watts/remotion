import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	cornerShapeGrid,
	cornerShapeValues,
	cornerShapeVariants,
} from './fixtures/corner-shape-grid';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for(
	cornerShapeVariants.flatMap((variant) =>
		[1, 1.25].flatMap((scale) =>
			[0, 1].map((frame) => ({variant, scale, frame})),
		),
	),
)(
	'compares shaped corners $variant scale=$scale frame=$frame',
	async ({variant, scale, frame}) => {
		const composition = cornerShapeGrid(variant);
		const Component = composition.component;
		const support = cornerShapeValues.map((value) => {
			const probe = document.createElement('div');
			probe.style.setProperty('corner-shape', value);
			document.body.appendChild(probe);
			try {
				const computed = getComputedStyle(probe);
				return {
					value,
					supported: CSS.supports('corner-shape', value),
					computed: computed.getPropertyValue('corner-shape'),
					corners: ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(
						(corner) => computed.getPropertyValue(`corner-${corner}-shape`),
					),
				};
			} finally {
				probe.remove();
			}
		});
		const reference = await captureNativeReference(
			{
				...composition,
				width: composition.width * scale,
				height: composition.height * scale,
				component: () => (
					<div style={{transform: `scale(${scale})`, transformOrigin: '0 0'}}>
						<Component />
					</div>
				),
			},
			frame,
			{omitBackground: false},
		);
		const actual = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition,
				frame,
				scale,
				inputProps: {},
				allowHtmlInCanvas: false,
				transparent: false,
			})
		).blob({format: 'png'});
		const folder = `test/__results__/corner-shape/${server.browser}/${variant}-${scale}-${frame}`;
		for (const [name, blob] of [
			['reference', reference],
			['actual', actual],
		] as const) {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		}

		const result = await countNativePixels(reference, actual);
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify({variant, scale, frame, support, ...result}),
		);
		expect(result.mismatchedPixels).toBe(0);
	},
);
