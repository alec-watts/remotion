import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const repeatingGradientStyles = (
	target: 'background' | 'mask',
	frame: number,
) => {
	const a = target === 'mask' ? 'transparent' : 'red';
	const b = target === 'mask' ? 'black' : 'blue';
	const size = frame === 0 ? 6 : 9;
	const values = [
		`to right, ${a} 0px, ${a} ${size}px, ${b} ${size}px, ${b} ${size * 2}px`,
		`to bottom, ${a} 0px, ${b} ${size * 2}px`,
		`45deg, ${a} 0%, ${b} 20%`,
		`135deg, ${a} -10px, ${a} 0px, ${b} 0px, ${b} 10px`,
		`to right, ${a} 5px, ${b} 17px`,
		`to right, ${a} 25%, ${b} 40%`,
		`to right, ${a} 0px, ${b}, ${a} 24px`,
		`to right, ${a} 0px ${size}px, ${b} ${size}px ${size * 2}px`,
		`to right, rgba(255, 0, 0, 0.25) 0px, rgba(0, 0, 255, 0.75) ${size * 2}px`,
		`to right, ${a} 0px, transparent ${size}px, ${b} ${size * 2}px`,
		`to right, ${a} 0px, ${b} 0px`,
		`to right, ${a} 0px, white 0px, ${b} 0px`,
		'to right, transparent 0px, black 0px',
		`to right, ${a} 0px, ${b} .2px`,
		`to right, ${a} 0px, white .1px, ${b} .2px`,
	];
	return [
		...values.map((value) => `repeating-linear-gradient(${value})`),
		`linear-gradient(to right, ${a} 0px, ${b} 104px)`,
	];
};

export const repeatingLinearGradient = (target: 'background' | 'mask') => {
	const Component = () => {
		const frame = useCurrentFrame();
		return (
			<AbsoluteFill
				style={{
					backgroundColor: 'white',
					display: 'grid',
					gridTemplateColumns: 'repeat(4, 104px)',
					gridTemplateRows: 'repeat(4, 64px)',
					gap: 12,
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
				{repeatingGradientStyles(target, frame).map((gradient) => (
					<div
						key={gradient}
						style={{
							width: 104,
							height: 64,
							backgroundColor: target === 'mask' ? '#3b82f6' : 'white',
							backgroundImage: target === 'background' ? gradient : undefined,
							maskImage: target === 'mask' ? gradient : undefined,
							maskMode: 'alpha',
						}}
					/>
				))}
			</AbsoluteFill>
		);
	};

	return {
		component: Component,
		id: `repeating-linear-gradient-${target}`,
		width: 484,
		height: 324,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
