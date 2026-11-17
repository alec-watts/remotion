import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const backdropFilterCases = [
	{mode: 'brightness', filter: 'brightness(50%)'},
	{mode: 'rounded-blur', filter: 'blur(4px)'},
	{mode: 'nested-opacity', filter: 'brightness(50%)'},
	{mode: 'blended', filter: 'brightness(50%)'},
	{mode: 'transformed', filter: 'blur(4px)'},
] as const;

type BackdropCase = (typeof backdropFilterCases)[number];

const Chart = () => {
	const frame = useCurrentFrame();
	return Array.from({length: 5}, (_, index) => (
		<div
			key={index}
			style={{
				position: 'absolute',
				top: 26,
				left: index * 40 + (frame === 0 ? 0 : 8),
				width: 25,
				height: 86,
				backgroundColor: index % 2 ? '#e6b246' : '#588ac0',
			}}
		/>
	));
};

export const backdropFilter = ({
	scene,
	enabled,
}: {
	scene: BackdropCase;
	enabled: boolean;
}) => {
	const Component = () => {
		const style: CSSProperties = {
			position: 'absolute',
			left: 42,
			top: 37,
			width: 106,
			height: 65,
			backdropFilter: enabled ? scene.filter : 'none',
			WebkitBackdropFilter: enabled ? scene.filter : 'none',
		};
		if (scene.mode === 'rounded-blur') style.borderRadius = 23;
		if (scene.mode === 'transformed') {
			style.transform = 'translate(6px, -4px) scale(1.25, 0.9)';
			style.transformOrigin = '0 0';
		}

		if (scene.mode === 'blended') {
			style.opacity = 0.6;
			style.mixBlendMode = 'multiply';
			style.backgroundColor = '#ff8a42cc';
		}

		const overlay = <div style={style} />;
		return (
			<AbsoluteFill style={{backgroundColor: '#183048'}}>
				{scene.mode === 'nested-opacity' ? (
					<AbsoluteFill style={{opacity: 0.75}}>
						<Chart />
						<AbsoluteFill style={{isolation: 'isolate'}}>
							{overlay}
						</AbsoluteFill>
					</AbsoluteFill>
				) : (
					<>
						<Chart />
						{overlay}
					</>
				)}
			</AbsoluteFill>
		);
	};

	return {
		component: Component,
		id: `backdrop-filter-${scene.mode}${enabled ? '' : '-control'}`,
		width: 200,
		height: 140,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
