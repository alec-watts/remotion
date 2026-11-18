import {AbsoluteFill, useCurrentFrame} from 'remotion';

const contexts = [255, 256, 512].map((count) => ({
	count,
	planes: Array.from({length: count}, (_, index) => ({
		id: `plane-${count}-${index}`,
		depth: index + 1,
		color: index === 0 ? 'red' : 'blue',
	})),
}));

const Component = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill
			style={{
				backgroundColor: 'white',
				display: 'grid',
				gridTemplateColumns: 'repeat(3, 96px)',
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
			{contexts.map(({count, planes}) => (
				<div
					key={count}
					data-context-plane-count={count}
					style={{
						position: 'relative',
						width: 96,
						height: 96,
						transformStyle: 'preserve-3d',
					}}
				>
					{planes.map(({id, depth, color}) => (
						<div
							key={id}
							data-plane-id={id}
							style={{
								position: 'absolute',
								left: 16,
								top: 16,
								width: 64,
								height: 64,
								backgroundColor: color,
								transform: `translateZ(${frame === 0 ? count - depth + 1 : depth}px)`,
							}}
						/>
					))}
				</div>
			))}
		</AbsoluteFill>
	);
};

export const largePreserve3DContext = {
	component: Component,
	id: 'large-preserve-3d-context',
	width: 352,
	height: 128,
	fps: 30,
	durationInFrames: 2,
} as const;
