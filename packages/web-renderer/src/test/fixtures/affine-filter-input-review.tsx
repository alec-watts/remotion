import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const filterInputReviewCases = [
	'scale-x',
	'reflected',
	'rotated',
	'skewed',
	'crossing-horizon',
	'behind-horizon',
] as const;

export const affineFilterInputReview = (
	variant: (typeof filterInputReviewCases)[number],
	preserve: boolean,
) => {
	const Component = () => {
		const frame = useCurrentFrame();
		const projected = variant.includes('horizon');
		const styles: Record<typeof variant, CSSProperties> = {
			'scale-x': {
				left: -100 + frame,
				top: 100,
				transform: 'translateX(-150px) scaleX(2)',
				filter: 'drop-shadow(150px 0 0 blue)',
			},
			reflected: {
				left: 400 - frame,
				top: 100,
				transform: 'translateX(150px) scaleX(-2)',
				filter: 'drop-shadow(150px 0 0 blue)',
			},
			rotated: {
				left: 100,
				top: -100 + frame,
				transform: 'translateY(-150px) rotate(90deg)',
				filter: 'drop-shadow(300px 0 0 blue)',
			},
			skewed: {
				left: -100 + frame,
				top: -100,
				transform: 'skewX(45deg)',
				filter: 'drop-shadow(0 100px 0 blue)',
			},
			'crossing-horizon': {
				left: 80 + frame,
				top: 100,
				width: 180,
				transform: 'translateZ(260px) rotateY(70deg)',
				filter: 'drop-shadow(150px 0 0 blue)',
			},
			'behind-horizon': {
				left: 80 + frame,
				top: 100,
				width: 180,
				transform: 'translateZ(500px) rotateY(70deg)',
				filter: 'drop-shadow(150px 0 0 blue)',
			},
		};
		return (
			<AbsoluteFill style={{backgroundColor: 'white'}}>
				<AbsoluteFill
					style={{
						transformStyle: preserve ? 'preserve-3d' : 'flat',
						perspective: projected ? 300 : undefined,
					}}
				>
					<div
						style={{
							position: 'absolute',
							width: 50,
							height: 50,
							backgroundColor: 'red',
							transformOrigin: projected ? '50% 50%' : '0 0',
							...styles[variant],
						}}
					/>
				</AbsoluteFill>
			</AbsoluteFill>
		);
	};

	return {
		component: Component,
		id: `affine-filter-review-${variant}-${preserve ? 'preserving' : 'flat'}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 2,
	} as const;
};

export const affineFilterInputReviewPreview = affineFilterInputReview(
	'scale-x',
	false,
);
