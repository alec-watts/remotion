import {loadFont} from '@remotion/fonts';
import type {CSSProperties} from 'react';
import {AbsoluteFill} from 'remotion';

const fontFamily = 'Vertical coverage Bangers';
export const verticalTextFontReady = loadFont({
	family: fontFamily,
	url: new URL('../../../../example/public/bangers.woff2', import.meta.url)
		.href,
	format: 'woff2',
});

export const verticalTextCases = [
	{
		id: 'horizontal',
		writingMode: 'horizontal-tb',
		textOrientation: 'mixed',
		text: 'Motion',
		decorated: false,
	},
	{
		id: 'upright',
		writingMode: 'vertical-rl',
		textOrientation: 'upright',
		text: 'Motion',
		decorated: false,
	},
	{
		id: 'mixed-script',
		writingMode: 'vertical-rl',
		textOrientation: 'mixed',
		text: 'Fly 日 up',
		decorated: true,
	},
	{
		id: 'left-column',
		writingMode: 'vertical-lr',
		textOrientation: 'sideways',
		text: 'Go אב',
		decorated: true,
	},
	{
		id: 'sideways',
		writingMode: 'sideways-lr',
		textOrientation: 'mixed',
		text: 'Motion',
		decorated: false,
	},
] as const satisfies readonly {
	id: string;
	writingMode: CSSProperties['writingMode'];
	textOrientation: CSSProperties['textOrientation'];
	text: string;
	decorated: boolean;
}[];

const width = 220;
const height = 180;

export const verticalTextNative = ({
	entry,
	carrier,
	backdrop = 'outer',
}: {
	entry: (typeof verticalTextCases)[number];
	carrier: 'html' | 'svg';
	backdrop?: 'outer' | 'transparent' | 'inside-svg';
}) => {
	const paintedText = () => (
		<div
			style={{
				position: 'absolute',
				left: 24,
				top: 20,
				width: 116,
				height: 146,
				fontFamily: `"${fontFamily}", sans-serif`,
				fontSize: 25,
				lineHeight: '28px',
				writingMode: entry.writingMode,
				textOrientation: entry.textOrientation,
				color: '#14293b',
				textDecoration: entry.decorated
					? 'underline 2px wavy #bf1233'
					: undefined,
				textDecorationSkipInk: 'none',
			}}
		>
			{entry.text}
		</div>
	);
	const Component = () => (
		<AbsoluteFill
			style={{backgroundColor: backdrop === 'outer' ? 'white' : 'transparent'}}
		>
			{carrier === 'svg' ? (
				<svg width={width} height={height}>
					<foreignObject x={0} y={0} width={width} height={height}>
						<div
							style={{
								position: 'relative',
								width,
								height,
								backgroundColor:
									backdrop === 'inside-svg' ? 'white' : 'transparent',
							}}
						>
							{paintedText()}
						</div>
					</foreignObject>
				</svg>
			) : (
				paintedText()
			)}
		</AbsoluteFill>
	);
	return {
		id:
			backdrop === 'outer'
				? `vertical-text-${entry.id}-${carrier}`
				: `vertical-text-${entry.id}-${carrier}-${backdrop}`,
		component: Component,
		width,
		height,
		fps: 30,
		durationInFrames: 1,
	};
};
