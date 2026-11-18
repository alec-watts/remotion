import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import {renderStillOnWeb} from '../render-still-on-web';
import {maskCopyOverflow} from './fixtures/mask-copy-overflow';
import {captureNativeReference, countNativePixels} from './native-reference';

test.for([
	...(['hard', 'soft', 'fractional', 'translucent'] as const).flatMap((mode) =>
		(['hidden', 'visible'] as const).flatMap((overflow) =>
			[1, 2.5].flatMap((scale) =>
				[0, 1].map((frame) => ({
					mode,
					overflow,
					scale,
					frame,
					position: null as {left: number; top: number} | null,
					offset: 'default',
				})),
			),
		),
	),
	...[0.5, 0.75].map((left) => ({
		mode: 'fractional' as const,
		overflow: 'visible' as const,
		scale: 1.75,
		frame: 0,
		position: {left, top: 0},
		offset: `${left},0`,
	})),
])(
	'checks native reference extent $mode $overflow scale=$scale frame=$frame offset=$offset',
	async ({mode, overflow, scale, frame, position, offset}) => {
		const composition = maskCopyOverflow({mode, overflow, position});
		const Component = composition.component;
		const folder = `test/__results__/mask-reference-extent/${server.browser}/${mode}-${overflow}-${scale}-${frame}-${offset}`;
		const evidence: Record<
			string,
			{
				error: string | null;
				geometry: {
					wrapperWidth: number;
					wrapperHeight: number;
					child: {left: number; top: number; width: number; height: number};
					maskImage: string;
					backgroundImage: string;
				} | null;
			}
		> = {};
		const captures = new Map<string, Blob>();
		const save = async (name: string, blob: Blob) => {
			let binary = '';
			for (const byte of new Uint8Array(await blob.arrayBuffer()))
				binary += String.fromCharCode(byte);
			await server.commands.writeFile(
				`${folder}/${name}.png`,
				btoa(binary),
				'base64',
			);
		};

		for (const variant of ['implicit', 'bounded', 'bounded-repeat']) {
			const current = {
				error: 'not-completed',
				geometry: null,
			} as (typeof evidence)[string];
			evidence[variant] = current;
			try {
				const blob = await captureNativeReference(
					{
						...composition,
						id: `${composition.id}-${variant}-${scale}`,
						width: composition.width * scale,
						height: composition.height * scale,
						component: () => (
							<div
								ref={(element) => {
									if (!element?.firstElementChild) return;
									const wrapper = element.getBoundingClientRect();
									const child =
										element.firstElementChild.getBoundingClientRect();
									const style = getComputedStyle(element.firstElementChild);
									current.geometry = {
										wrapperWidth: wrapper.width,
										wrapperHeight: wrapper.height,
										child: {
											left: child.left - wrapper.left,
											top: child.top - wrapper.top,
											width: child.width,
											height: child.height,
										},
										maskImage: style.maskImage,
										backgroundImage: style.backgroundImage,
									};
								}}
								style={{
									transform: `scale(${scale})`,
									transformOrigin: '0 0',
									...(variant === 'implicit'
										? {}
										: {width: composition.width, height: composition.height}),
								}}
							>
								<Component />
							</div>
						),
					},
					frame,
					{omitBackground: mode !== 'hard'},
				);
				captures.set(variant, blob);
				await save(variant, blob);
				current.error = null;
			} catch (error) {
				current.error = String(error);
			}

			await server.commands.writeFile(
				`${folder}/comparison.json`,
				JSON.stringify({
					mode,
					overflow,
					scale,
					frame,
					position,
					offset,
					evidence,
				}),
			);
		}

		const actual = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition,
				frame,
				scale,
				inputProps: {},
				allowHtmlInCanvas: false,
			})
		).blob({format: 'png'});
		await save('actual', actual);
		const comparisons: Record<
			string,
			Awaited<ReturnType<typeof countNativePixels>>
		> = {};
		for (const [variant, blob] of captures)
			comparisons[variant] = await countNativePixels(blob, actual);
		const implicit = captures.get('implicit');
		const bounded = captures.get('bounded');
		const repeat = captures.get('bounded-repeat');
		if (implicit && bounded)
			comparisons['implicit-to-bounded'] = await countNativePixels(
				implicit,
				bounded,
			);
		if (bounded && repeat)
			comparisons['bounded-to-repeat'] = await countNativePixels(
				bounded,
				repeat,
			);
		await server.commands.writeFile(
			`${folder}/comparison.json`,
			JSON.stringify({
				mode,
				overflow,
				scale,
				frame,
				position,
				offset,
				evidence,
				comparisons,
			}),
		);
		for (const variant of ['implicit', 'bounded', 'bounded-repeat']) {
			expect.soft(evidence[variant].error).toBeNull();
			expect.soft(comparisons[variant]?.mismatchedPixels).toBe(0);
			expect.soft(evidence[variant].geometry?.child).toEqual({
				left: (position?.left ?? (mode === 'fractional' ? 0.25 : 0)) * scale,
				top: (position?.top ?? 0) * scale,
				width: composition.width * scale,
				height: composition.height * scale,
			});
		}

		expect
			.soft(evidence.implicit.geometry?.child)
			.toEqual(evidence.bounded.geometry?.child);
		expect
			.soft(evidence.implicit.geometry?.maskImage)
			.toBe(evidence.bounded.geometry?.maskImage);
		expect
			.soft(evidence.implicit.geometry?.backgroundImage)
			.toBe(evidence.bounded.geometry?.backgroundImage);
		expect.soft(comparisons['implicit-to-bounded']?.mismatchedPixels).toBe(0);
		expect.soft(comparisons['bounded-to-repeat']?.mismatchedPixels).toBe(0);
	},
);
