import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const backfaceNativeCases = [
	'front',
	'back-hidden',
	'back-visible',
	'reflect-x',
	'reflect-z',
	'nested-double-turn',
	'flat-double-turn',
	'hidden-parent-front-child',
] as const;

export const backfaceNative = (
	variant: (typeof backfaceNativeCases)[number],
) => {
	const Component = () => {
		const frame = useCurrentFrame();
		const nested =
			variant === 'nested-double-turn' ||
			variant === 'flat-double-turn' ||
			variant === 'hidden-parent-front-child';
		const transform =
			variant === 'reflect-x'
				? 'scaleX(-1)'
				: variant === 'reflect-z'
					? 'scaleZ(-1)'
					: variant === 'front'
						? 'rotateY(0deg)'
						: 'rotateY(180deg)';
		const style: CSSProperties = {
			position: 'absolute',
			left: 100 + frame,
			top: 100,
			width: 100,
			height: 100,
			backgroundColor: nested ? 'red' : 'blue',
			transform,
			transformOrigin: '50px 50px',
			backfaceVisibility:
				variant === 'back-visible' || nested
					? variant === 'hidden-parent-front-child'
						? 'hidden'
						: 'visible'
					: 'hidden',
			transformStyle:
				nested && variant !== 'flat-double-turn' ? 'preserve-3d' : 'flat',
		};
		return (
			<AbsoluteFill style={{backgroundColor: 'white'}}>
				<div style={style}>
					{nested ? (
						<div
							style={{
								width: 100,
								height: 100,
								backgroundColor: 'blue',
								transform: 'rotateY(180deg)',
								transformOrigin: '50px 50px',
								backfaceVisibility: 'hidden',
							}}
						/>
					) : null}
				</div>
			</AbsoluteFill>
		);
	};
	return {
		component: Component,
		id: `backface-native-${variant}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
