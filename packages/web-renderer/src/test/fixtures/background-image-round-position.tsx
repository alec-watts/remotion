import {AbsoluteFill, useCurrentFrame} from 'remotion';

// Opaque quadrants expose positioning on both axes without alpha transfer.
const raster =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAK0lEQVR4AaXBQQEAMAwCsQNllTbnzAEfEgVCIUJjRmZkRuIRihyVGZmRGX2YUAXLfpFI2gAAAABJRU5ErkJggg==';
const cases = [
	{backgroundRepeat: 'round', backgroundSize: '35px 35px'},
	{backgroundRepeat: 'round repeat', backgroundSize: '35px auto'},
	{backgroundRepeat: 'repeat round', backgroundSize: 'auto 35px'},
	{backgroundRepeat: 'round no-repeat', backgroundSize: '35px 35px'},
] as const;

const Component = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill
			style={{
				backgroundColor: 'white',
				display: 'grid',
				gridTemplateColumns: 'repeat(4, 96px)',
				gridTemplateRows: 'repeat(2, 96px)',
				gap: 8,
				padding: 8,
			}}
		>
			{(['auto', 'pixelated'] as const).flatMap((imageRendering) =>
				cases.map((style) => (
					<div
						key={`${imageRendering}-${style.backgroundRepeat}`}
						style={{
							width: 96,
							height: 96,
							backgroundColor: 'white',
							backgroundImage: `url("${raster}")`,
							backgroundPosition: frame === 0 ? '25% 75%' : '80% 20%',
							imageRendering,
							...style,
						}}
					/>
				)),
			)}
		</AbsoluteFill>
	);
};

export const backgroundImageRoundPosition = {
	component: Component,
	id: 'background-image-round-position',
	width: 424,
	height: 216,
	fps: 30,
	durationInFrames: 2,
} as const;
