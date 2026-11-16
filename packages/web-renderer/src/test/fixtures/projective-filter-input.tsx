import React from 'react';
import {AbsoluteFill} from 'remotion';

export const filterInputCases = [
	{kind: 'scaled', left: -100, transform: 'translateX(-150px) scaleX(2)'},
	{kind: 'reflected', left: 400, transform: 'translateX(150px) scaleX(-2)'},
	{
		kind: 'skewed',
		left: -100,
		transform: 'translateX(-150px) scaleX(2) skewY(10deg)',
	},
	{
		kind: 'projective',
		left: -100,
		transform: 'translateX(-150px) scaleX(2) rotateY(20deg)',
	},
] as const;

export const projectiveFilterInput = (
	kind: (typeof filterInputCases)[number]['kind'],
	preserving: boolean,
) => {
	const scene = filterInputCases.find((item) => item.kind === kind)!;
	const Component: React.FC = () => (
		<AbsoluteFill
			style={{
				backgroundColor: 'white',
				perspective: kind === 'projective' ? 400 : undefined,
				transformStyle: preserving ? 'preserve-3d' : 'flat',
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: scene.left,
					top: 100,
					width: 50,
					height: 50,
					backgroundColor: 'red',
					transform: scene.transform,
					transformOrigin: '0 0',
					filter: 'drop-shadow(150px 0 0 blue)',
				}}
			/>
		</AbsoluteFill>
	);
	return {
		component: Component,
		id: `filter-input-${kind}-${preserving ? 'preserving' : 'flat'}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 1,
	} as const;
};
