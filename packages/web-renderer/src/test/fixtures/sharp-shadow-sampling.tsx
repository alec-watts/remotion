import {AbsoluteFill} from 'remotion';

export const sharpShadowScales = [1, 1.5, 2, 2.5];
export const sharpShadowModes = ['filter', 'translated', 'device'] as const;
export const sharpShadowPlacements = [
	{kind: 'layout', left: -250, translation: 0},
	{kind: 'nearer', left: 20, translation: -150},
	{kind: 'opposite', left: 200, translation: 150},
] as const;

export const sharpShadowSampling = (
	{scale, mode}: {scale: number; mode: (typeof sharpShadowModes)[number]},
	placement: (typeof sharpShadowPlacements)[number] | null = null,
) => {
	const left = placement?.left ?? -100;
	const translation = placement?.translation ?? -150;
	const shadowOffset = (50 - left - translation) / scale;
	const Component = () => (
		<AbsoluteFill style={{backgroundColor: 'white'}}>
			<div
				style={{
					position: 'absolute',
					left: mode === 'device' ? 50 : left,
					top: 100,
					width: mode === 'device' ? 50 * scale : 50,
					height: 50,
					backgroundColor: mode === 'filter' ? 'red' : 'blue',
					transform:
						mode === 'device'
							? undefined
							: `translateX(${translation}px) scaleX(${scale})${mode === 'translated' ? ` translateX(${shadowOffset}px)` : ''}`,
					transformOrigin: '0 0',
					filter:
						mode === 'filter'
							? `drop-shadow(${shadowOffset}px 0 0 blue)`
							: undefined,
				}}
			/>
		</AbsoluteFill>
	);

	return {
		component: Component,
		id: `sharp-shadow-sampling-${mode}-${String(scale).replace('.', 'p')}${placement ? '-' + placement.kind : ''}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 1,
	} as const;
};
