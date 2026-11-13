import {AbsoluteFill} from 'remotion';

export const svgRootMaskModes = [
	'user-space',
	'object-bounds',
	'view-box',
	'css-important',
	'filter-clip',
	'alpha',
] as const;

export const svgRootMaskGeometry = (
	mode: (typeof svgRootMaskModes)[number],
	scale: number,
) => {
	const Component = () => {
		const factor = mode === 'view-box' ? 2 : 1;
		return (
			<AbsoluteFill style={{background: 'white'}}>
				{mode === 'css-important' ? (
					<style>
						{
							'.root-svg-mask-css {mask-image:url(#root-svg-geometry-mask) !important}'
						}
					</style>
				) : null}
				<svg
					className="root-svg-mask-css"
					width={160}
					height={80}
					viewBox={`0 0 ${160 * factor} ${80 * factor}`}
					mask={
						mode === 'css-important'
							? undefined
							: 'url(#root-svg-geometry-mask)'
					}
					style={{
						position: 'absolute',
						left: 20,
						top: 20,
						transformOrigin: '0 0',
						transform: `scale(${scale})`,
						opacity: 0.75,
						filter:
							mode === 'filter-clip' ? 'drop-shadow(9px 0 0 blue)' : undefined,
						clipPath: mode === 'filter-clip' ? 'inset(0 25px 0 0)' : undefined,
					}}
				>
					<defs>
						<mask
							id="root-svg-geometry-mask"
							maskUnits={
								mode === 'object-bounds'
									? 'objectBoundingBox'
									: 'userSpaceOnUse'
							}
							maskContentUnits={
								mode === 'object-bounds'
									? 'objectBoundingBox'
									: 'userSpaceOnUse'
							}
							x={0}
							y={0}
							width={mode === 'object-bounds' ? 1 : 160 * factor}
							height={mode === 'object-bounds' ? 1 : 80 * factor}
							style={{maskType: mode === 'alpha' ? 'alpha' : 'luminance'}}
						>
							<rect
								x={mode === 'object-bounds' ? 0.25 : 35 * factor}
								y={0}
								width={mode === 'object-bounds' ? 0.5 : 65 * factor}
								height={mode === 'object-bounds' ? 1 : 80 * factor}
								fill={mode === 'alpha' ? 'black' : 'white'}
							/>
						</mask>
					</defs>
					<rect
						x={20 * factor}
						y={10 * factor}
						width={100 * factor}
						height={50 * factor}
						fill="red"
					/>
				</svg>
			</AbsoluteFill>
		);
	};
	return {
		component: Component,
		id: `svg-root-mask-${mode}-${String(scale).replace('.', '-')}`,
		width: 300,
		height: 200,
		fps: 30,
		durationInFrames: 1,
	} as const;
};
