import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {rasterMask} from './mask-image-url-sizing';

export const rasterMaskRepeats = [
	'round',
	'round no-repeat',
	'no-repeat round',
	'round repeat',
	'repeat round',
	'round space',
	'space round',
	'space',
	'space no-repeat',
	'no-repeat space',
	'space repeat',
	'repeat space',
] as const;

const Component = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill
			style={{
				backgroundColor: 'white',
				display: 'grid',
				gridTemplateColumns: 'repeat(4, 120px)',
				gridTemplateRows: 'repeat(4, 60px)',
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
			{rasterMaskRepeats.map((maskRepeat, index) => (
				<div
					key={maskRepeat}
					data-raster-mask-repeat=""
					style={{
						position: 'relative',
						width: 120,
						height: 60,
						overflow: 'hidden',
						backgroundColor: '#e5484d',
						maskImage:
							(index + frame) % 2 === 0
								? `url("${rasterMask}")`
								: `url("${rasterMask}"), url("${rasterMask}")`,
						maskComposite: 'add',
						maskSize: frame === 0 ? '52px 29px' : '52px auto',
						maskPosition: frame === 0 ? '25% 75%' : '80% 20%',
						maskRepeat,
					}}
				>
					<div
						style={{
							position: 'absolute',
							left: 60,
							top: 0,
							width: 60,
							height: 60,
							backgroundColor: '#3e63dd',
						}}
					/>
				</div>
			))}
			{['space repeat', 'round space'].map((backgroundRepeat) => (
				<div
					key={`background-${backgroundRepeat}`}
					style={{
						width: 120,
						height: 60,
						backgroundColor: '#e5484d',
						backgroundImage: `url("${rasterMask}")`,
						backgroundSize: frame === 0 ? '52px 29px' : '52px auto',
						backgroundPosition: frame === 0 ? '25% 75%' : '80% 20%',
						backgroundRepeat,
					}}
				/>
			))}
		</AbsoluteFill>
	);
};

export const maskImageUrlRepeat = {
	component: Component,
	id: 'mask-image-url-repeat',
	width: 560,
	height: 320,
	fps: 30,
	durationInFrames: 2,
} as const;
