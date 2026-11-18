import {AbsoluteFill} from 'remotion';
import {rasterMask} from './mask-image-url-sizing';
import {svgFontFamilyLifetimeFamily} from './svg-font-family-lifetime';

export const svgMaskedPaintProfiles = ['clear', 'filled'] as const;
export const svgMaskedPaintModes = ['none', 'gradient', 'url'] as const;

export const svgMaskedPaintProfile = ({
	profile,
	mask,
}: {
	profile: (typeof svgMaskedPaintProfiles)[number];
	mask: (typeof svgMaskedPaintModes)[number];
}) => ({
	id: `svg-masked-paint-${profile}-${mask}`,
	width: 340,
	height: 140,
	fps: 30,
	durationInFrames: 1,
	component: () => (
		<AbsoluteFill style={{backgroundColor: '#cbd2fc'}}>
			<div style={{position: 'absolute', left: 12, top: 9, opacity: 0.75}}>
				<svg
					width={300}
					height={100}
					style={{
						display: 'block',
						maskImage:
							mask === 'none'
								? 'none'
								: mask === 'url'
									? `url("${rasterMask}")`
									: 'linear-gradient(90deg, rgba(0,0,0,0.2), black)',
						maskSize: '100% 100%',
						maskRepeat: 'no-repeat',
					}}
				>
					{profile === 'filled' ? (
						<rect width={300} height={100} fill="#e8edf3" />
					) : null}
					<text
						x={11.5}
						y={63.5}
						fill="#b73368"
						style={{
							fontFamily: `${JSON.stringify(svgFontFamilyLifetimeFamily)},serif`,
							fontSize: 32,
						}}
					>
						Color + alpha
					</text>
				</svg>
			</div>
		</AbsoluteFill>
	),
});
