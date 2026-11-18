import {useCurrentFrame} from 'remotion';

export const maskCopyOffsets = [
	{left: -0.25, top: 0},
	{left: 0, top: 0},
	{left: 0.25, top: 0},
	{left: 0.5, top: 0},
	{left: 0.75, top: 0},
	{left: 0, top: 0.25},
	{left: 0.25, top: 0.25},
];

export const maskCopyOverflow = ({
	overflow,
	mode,
	position,
}: {
	overflow: 'hidden' | 'visible';
	mode: 'hard' | 'soft' | 'fractional' | 'translucent';
	position: {left: number; top: number} | null;
}) => {
	const Component = () => {
		const frame = useCurrentFrame();
		return (
			<div
				style={{
					position: 'absolute',
					left: position?.left ?? (mode === 'fractional' ? 0.25 : 0),
					top: position?.top ?? 0,
					width: 100,
					height: 40,
					overflow,
					borderRadius: mode === 'fractional' ? 4.25 : 0,
					backgroundImage:
						mode === 'translucent'
							? `linear-gradient(90deg, rgb(0 0 255 / 60%) ${50 - frame * 10}%, rgb(255 0 0 / 35%) ${50 - frame * 10}%)`
							: `linear-gradient(90deg, blue ${50 - frame * 10}%, red ${50 - frame * 10}%)`,
					maskImage: `${mode === 'hard' ? 'linear-gradient(black, black)' : 'linear-gradient(90deg, black, transparent)'}, linear-gradient(black, black)`,
					maskComposite: 'intersect',
				}}
			/>
		);
	};

	const suffix = position
		? `-${position.left}-${position.top}`.replaceAll('.', 'p')
		: '';
	return {
		component: Component,
		id: `mask-copy-overflow-${overflow}-${mode}${suffix}`,
		width: 100,
		height: 40,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
