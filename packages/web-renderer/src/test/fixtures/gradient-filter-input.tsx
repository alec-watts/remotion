import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const filteredGradientCases = [
	{side: 'left', rect: [-50, 10, 100, 20], matrix: [1, 0, 0, 1, 0, 0]},
	{side: 'right', rect: [10, 10, 100, 20], matrix: [1, 0, 0, 1, 0, 0]},
	{side: 'top', rect: [10, -50, 40, 70], matrix: [1, 0, 0, 1, 0, 0]},
	{side: 'bottom', rect: [10, 20, 40, 70], matrix: [1, 0, 0, 1, 0, 0]},
	{side: 'scaled', rect: [-25, 5, 50, 10], matrix: [2, 0, 0, 2, 0, 0]},
	{side: 'reflected', rect: [-20, 5, 50, 10], matrix: [-2, 0, 0, 2, 10, 0]},
	{
		side: 'fractional',
		rect: [-50, 10, 100, 20],
		matrix: [1, 0, 0, 1, 0.25, 0.5],
	},
	{
		side: 'skewed',
		rect: [-50, 10, 100, 20],
		matrix: [1, 0.25, 0.5, 1, -10, -5],
	},
] as const;

export const filteredGradientModes = ['solid', 'hard'] as const;

export const gradientFilterInput = (
	side: (typeof filteredGradientCases)[number]['side'],
	mode: (typeof filteredGradientModes)[number],
) => {
	const scene = filteredGradientCases.find((c) => c.side === side)!;
	const Component = () => {
		const frame = useCurrentFrame();
		return (
			<AbsoluteFill style={{backgroundColor: 'white'}}>
				<AbsoluteFill
					style={{
						transform: `matrix(${scene.matrix.join(',')})`,
						transformOrigin: '0 0',
					}}
				>
					<div
						style={{
							position: 'absolute',
							left: scene.rect[0] + frame,
							top: scene.rect[1],
							width: scene.rect[2],
							height: scene.rect[3],
							filter: 'blur(6px)',
							backgroundImage:
								mode === 'solid'
									? 'linear-gradient(90deg, red, red)'
									: 'linear-gradient(90deg, red 0%, red 50%, blue 50%, blue 100%)',
						}}
					/>
				</AbsoluteFill>
			</AbsoluteFill>
		);
	};

	return {
		id: `gradient-filter-input-${side}-${mode}`,
		component: Component,
		width: 60,
		height: 40,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
