import {useCurrentFrame} from 'remotion';

export const maskCopyOverflow = ({
	overflow,
	mode,
}: {
	overflow: 'hidden' | 'visible';
	mode: 'hard' | 'soft' | 'fractional';
}) => {
	const Component = () => {
		const frame = useCurrentFrame();
		return (
			<div
				style={{
					position: 'absolute',
					left: mode === 'fractional' ? 0.25 : 0,
					top: 0,
					width: 100,
					height: 40,
					overflow,
					borderRadius: mode === 'fractional' ? 4.25 : 0,
					backgroundImage: `linear-gradient(90deg, blue ${50 - frame * 10}%, red ${50 - frame * 10}%)`,
					maskImage: `${mode === 'hard' ? 'linear-gradient(black, black)' : 'linear-gradient(90deg, black, transparent)'}, linear-gradient(black, black)`,
					maskComposite: 'intersect',
				}}
			/>
		);
	};

	return {
		component: Component,
		id: `mask-copy-overflow-${overflow}-${mode}`,
		width: 100,
		height: 40,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
