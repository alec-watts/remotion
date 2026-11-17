import {AbsoluteFill} from 'remotion';

export const scaledGradientGroups = [
	{
		id: 'opacity',
		transform: 'none',
		fractional: false,
		hard: true,
		opacity: 0.75,
	},
	{
		id: 'scale',
		transform: 'scale(2)',
		fractional: false,
		hard: true,
		opacity: 1,
	},
	{
		id: 'scale-opacity',
		transform: 'scale(2)',
		fractional: false,
		hard: true,
		opacity: 0.75,
	},
	{
		id: 'fractional',
		transform: 'scale(1.5, 2)',
		fractional: true,
		hard: true,
		opacity: 0.75,
	},
	{
		id: 'fractional-transform',
		transform: 'translate(0.25px, 0.5px) scale(1.5, 2)',
		fractional: false,
		hard: true,
		opacity: 0.75,
	},
	{
		id: 'color-stops',
		transform: 'scale(2)',
		fractional: false,
		hard: false,
		opacity: 0.75,
	},
	{
		id: 'reduced',
		transform: 'scale(0.75)',
		fractional: true,
		hard: false,
		opacity: 0.75,
	},
] as const;

export const scaledGradientGroup = (
	entry: (typeof scaledGradientGroups)[number],
) => ({
	id: 'scaled-gradient-group-' + entry.id,
	component: () => (
		<AbsoluteFill style={{backgroundColor: 'white'}}>
			<div
				style={{
					position: 'absolute',
					left: entry.fractional ? 20.25 : 20,
					top: entry.fractional ? 20.5 : 20,
					width: 120,
					height: 40,
					transform: entry.transform,
					transformOrigin: '0 0',
					opacity: entry.opacity,
					backgroundColor: 'white',
					backgroundImage: entry.hard
						? 'linear-gradient(90deg, red 0%, red 50%, blue 50%, blue 100%)'
						: 'linear-gradient(90deg, #f00 15px, #0f0 60px, #00f 110px)',
				}}
			/>
		</AbsoluteFill>
	),
	width: 320,
	height: 160,
	fps: 30,
	durationInFrames: 1,
});
