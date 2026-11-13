import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

const geometry = {
	fractional: {
		left: -99.75,
		transform: 'translateX(-150px) scaleX(2)',
		filter: 'drop-shadow(150px 0 0 blue)',
	},
	rounded: {
		left: -100,
		borderRadius: '13.5px',
		transform: 'translateX(-150px) scaleX(2)',
		filter: 'drop-shadow(150px 0 0 blue)',
	},
	blurred: {
		left: -100,
		transform: 'translateX(-150px) scaleX(2)',
		filter: 'drop-shadow(150px 0 3px blue)',
	},
	textured: {
		left: -100,
		background: 'conic-gradient(from 17deg, red, transparent, red)',
		transform: 'translateX(-150px) scaleX(2)',
		filter: 'drop-shadow(150px 0 0 blue)',
	},
	scaled: {
		left: -100,
		transform: 'translateX(-150px) scaleX(2)',
		filter: 'drop-shadow(150px 0 0 blue)',
	},
	reflected: {
		left: -100,
		transform: 'translateX(550px) scaleX(-2)',
		filter: 'drop-shadow(150px 0 0 blue)',
	},
	negative: {
		left: 200,
		transform: 'translateX(150px) scaleX(2)',
		filter: 'drop-shadow(-150px 0 0 blue)',
	},
} satisfies Record<string, CSSProperties>;

const ShadowScene = ({
	variant,
	preserve,
}: {
	variant: keyof typeof geometry;
	preserve: boolean;
}) => {
	const frame = useCurrentFrame();
	const shadow = (
		<div
			style={{
				position: 'absolute',
				top: 100 + frame * 10,
				width: 50,
				height: 50,
				background: 'red',
				transformOrigin: '0 0',
				...geometry[variant],
			}}
		/>
	);
	return (
		<AbsoluteFill style={{backgroundColor: 'white'}}>
			{preserve ? (
				<AbsoluteFill style={{transformStyle: 'preserve-3d'}}>
					{shadow}
				</AbsoluteFill>
			) : (
				shadow
			)}
		</AbsoluteFill>
	);
};

export const makeScaledShadowFixture = (
	variant: keyof typeof geometry,
	preserve: boolean,
) => ({
	id: `3d-shadow-${variant}${preserve ? '-preserve' : ''}`,
	component: () => <ShadowScene variant={variant} preserve={preserve} />,
	width: 300,
	height: 300,
	fps: 30,
	durationInFrames: 2,
});
