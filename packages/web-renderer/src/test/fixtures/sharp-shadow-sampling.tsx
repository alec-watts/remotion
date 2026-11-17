import {AbsoluteFill} from 'remotion';

export const sharpShadowScales = [1, 1.5, 2, 2.5];
export const sharpShadowModes = ['filter', 'translated', 'device'] as const;

export const sharpShadowSampling = ({
	scale,
	mode,
}: {
	scale: number;
	mode: (typeof sharpShadowModes)[number];
}) => {
	const shadowOffset = 300 / scale;
	const Component = () => (
		<AbsoluteFill style={{backgroundColor: 'white'}}>
			<div
				style={{
					position: 'absolute',
					left: mode === 'device' ? 50 : -100,
					top: 100,
					width: mode === 'device' ? 50 * scale : 50,
					height: 50,
					backgroundColor: mode === 'filter' ? 'red' : 'blue',
					transform:
						mode === 'device'
							? undefined
							: `translateX(-150px) scaleX(${scale})${mode === 'translated' ? ` translateX(${shadowOffset}px)` : ''}`,
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
		id: `sharp-shadow-sampling-${mode}-${String(scale).replace('.', 'p')}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 1,
	} as const;
};
