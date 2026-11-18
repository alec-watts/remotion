import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {rasterMask} from './mask-image-url-sizing';

export const mixedBackgroundRepeats = [
	'space repeat',
	'repeat space',
	'round space',
	'space round',
	'space',
	'space no-repeat',
	'no-repeat space',
	'round',
] as const;

export const mixedBackgroundSampling = (pixelated: boolean) => {
	const Component = () => {
		const frame = useCurrentFrame();
		return (
			<AbsoluteFill
				style={{
					backgroundColor: 'white',
					display: 'grid',
					gridTemplateColumns: 'repeat(4, 120px)',
					gridTemplateRows: 'repeat(2, 60px)',
					gap: 16,
					padding: 16,
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: 5,
						height: 5,
						backgroundColor: '#00aa55',
					}}
				/>
				{mixedBackgroundRepeats.map((backgroundRepeat) => (
					<div
						key={backgroundRepeat}
						style={{
							width: 120,
							height: 60,
							backgroundColor: '#e5484d',
							backgroundImage: `url("${rasterMask}")`,
							backgroundRepeat,
							backgroundSize: frame === 0 ? '52px 29px' : '52px auto',
							backgroundPosition: frame === 0 ? '25% 75%' : '80% 20%',
							imageRendering: pixelated ? 'pixelated' : 'auto',
						}}
					/>
				))}
			</AbsoluteFill>
		);
	};
	return {
		component: Component,
		id: `mixed-background-sampling-${pixelated}`,
		width: 560,
		height: 168,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
