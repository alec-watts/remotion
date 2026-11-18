import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const cornerShapeValues = [
	'round',
	'square',
	'bevel',
	'notch',
	'scoop',
	'squircle',
	'superellipse(3)',
	'bevel notch scoop round',
] as const;

export const cornerShapeVariants = [
	'paint',
	'border',
	'overflow',
	'effects',
] as const;

export const cornerShapeGrid = (
	variant: (typeof cornerShapeVariants)[number],
) => {
	const Component = () => {
		const frame = useCurrentFrame();
		return (
			<AbsoluteFill style={{backgroundColor: 'white'}}>
				{cornerShapeValues.map((cornerShape, index) => (
					<div
						key={cornerShape}
						data-corner-shape={cornerShape}
						style={
							{
								position: 'absolute',
								left: 16 + (index % 4) * 128,
								top: 16 + Math.floor(index / 4) * 140,
								width: 96,
								height: 96,
								boxSizing: 'border-box',
								backgroundColor: 'rgb(20, 80, 220)',
								borderRadius:
									frame === 0
										? '24px 32px 16px 20px / 20px 12px 32px 16px'
										: '32px 12px 28px 20px / 16px 30px 20px 12px',
								cornerShape,
								borderStyle: variant === 'border' ? 'solid' : 'none',
								borderWidth: variant === 'border' ? '3px 7px 11px 5px' : 0,
								borderColor:
									'rgb(30, 180, 90) rgb(220, 160, 20) rgb(120, 30, 190) rgb(10, 150, 180)',
								overflow: variant === 'overflow' ? 'hidden' : 'visible',
								transform: variant === 'effects' ? 'rotate(7deg)' : 'none',
								opacity: variant === 'effects' ? 0.65 : 1,
								filter:
									variant === 'effects'
										? 'drop-shadow(3px 4px 0 rgb(10, 180, 70))'
										: 'none',
							} as CSSProperties
						}
					>
						{variant === 'overflow' ? (
							<div
								style={{
									position: 'absolute',
									left: -8,
									top: -8,
									width: 120,
									height: 120,
									backgroundColor: 'rgb(220, 40, 60)',
								}}
							/>
						) : null}
					</div>
				))}
			</AbsoluteFill>
		);
	};

	return {
		component: Component,
		id: `corner-shape-grid-${variant}`,
		width: 512,
		height: 280,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
