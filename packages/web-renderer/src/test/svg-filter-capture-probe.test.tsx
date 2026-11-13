import {useLayoutEffect, useRef} from 'react';
import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {
	affineFilterInputReview,
	filterInputReviewCases,
} from './fixtures/affine-filter-input-review';
import {makeScaledShadowFixture} from './fixtures/affine-filter-stress';
import {captureNativeReference, countNativePixels} from './native-reference';

const cases = [
	...filterInputReviewCases.flatMap((variant) =>
		[false, true].flatMap((preserve) =>
			[0, 1].map((frame) => ({
				group: 'review',
				variant,
				preserve,
				frame,
				composition: affineFilterInputReview(variant, preserve),
			})),
		),
	),
	...(
		[
			'fractional',
			'rounded',
			'blurred',
			'textured',
			'scaled',
			'reflected',
			'negative',
		] as const
	).flatMap((variant) =>
		[false, true].flatMap((preserve) =>
			[0, 1].map((frame) => ({
				group: 'stress',
				variant,
				preserve,
				frame,
				composition: makeScaledShadowFixture(variant, preserve),
			})),
		),
	),
];

test.for(cases)(
	'compares SVG capture for $group/$variant preserve=$preserve frame=$frame',
	async ({group, variant, preserve, frame, composition}) => {
		let serialized: string | null = null;
		const Component = composition.component;
		const Capture = () => {
			const ref = useRef<HTMLDivElement>(null);
			useLayoutEffect(() => {
				const source = ref.current;
				if (!source) throw new Error('SVG probe source was not committed');
				const clone = source.cloneNode(true) as HTMLDivElement;
				const originals = [source, ...source.querySelectorAll('*')];
				const copies = [clone, ...clone.querySelectorAll('*')];
				for (const [index, original] of originals.entries()) {
					const style = getComputedStyle(original);
					const target = copies[index] as HTMLElement | SVGElement;
					for (const property of Array.from(style)) {
						target.style.setProperty(
							property,
							style.getPropertyValue(property),
						);
					}
				}

				serialized = new XMLSerializer().serializeToString(clone);
			}, []);
			return (
				<div
					ref={ref}
					style={{
						position: 'relative',
						width: composition.width,
						height: composition.height,
					}}
				>
					<Component />
				</div>
			);
		};

		const native = await captureNativeReference(
			{...composition, component: Capture, id: `svg-probe-${composition.id}`},
			frame,
			{omitBackground: false},
		);
		if (serialized === null)
			throw new Error('SVG probe did not retain the committed DOM');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.width}" height="${composition.height}" viewBox="0 0 ${composition.width} ${composition.height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
		const path = `test/__results__/svg-filter-probe/${group}/${server.browser}/${variant}-${preserve}-${frame}`;
		await server.commands.writeFile(`${path}/source.svg`, svg);
		const canvas = new OffscreenCanvas(composition.width, composition.height);
		const image = new Image();
		try {
			image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
			await image.decode();
			const context = canvas.getContext('2d');
			if (!context)
				throw new Error('SVG probe could not create its output context');
			context.fillStyle = 'white';
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(image, 0, 0);
			const output = await canvas.convertToBlob({type: 'image/png'});
			const difference = await countNativePixels(native, output);
			for (const [name, blob] of [
				['native', native],
				['svg', output],
			] as const) {
				let binary = '';
				for (const byte of new Uint8Array(await blob.arrayBuffer()))
					binary += String.fromCharCode(byte);
				await server.commands.writeFile(
					`${path}/${name}.png`,
					btoa(binary),
					'base64',
				);
			}

			await server.commands.writeFile(
				`${path}/comparison.json`,
				JSON.stringify({
					group,
					variant,
					preserve,
					frame,
					browser: server.browser,
					userAgent: navigator.userAgent,
					backend: 'svg-foreign-object',
					mismatchedPixels: difference.mismatchedPixels,
					maxChannelDelta: difference.maxChannelDelta,
				}),
			);
			expect(difference.mismatchedPixels).toBe(0);
		} finally {
			image.src = '';
			canvas.width = 0;
			canvas.height = 0;
		}
	},
);
