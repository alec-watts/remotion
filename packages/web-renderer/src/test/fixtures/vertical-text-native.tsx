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

export const verticalTextNative = ({
	entry,
	carrier,
	placement = 'original',
}: {
	entry: (typeof verticalTextCases)[number];
	carrier: 'html' | 'svg';
	placement?: 'original' | 'inset';
}) => {
	const inset = placement === 'inset';
	const width = inset ? 340 : 220;
	const height = inset ? 260 : 180;
	const paintedText = () => (
		<div
			style={{
				position: 'absolute',
				left: inset ? 76.25 : 24,
				top: inset ? 62.5 : 20,
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
		<AbsoluteFill style={{backgroundColor: 'white'}}>
			{carrier === 'svg' ? (
				<svg width={width} height={height}>
					<foreignObject x={0} y={0} width={width} height={height}>
						<div style={{position: 'relative', width, height}}>
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
		id: `vertical-text-${entry.id}-${carrier}${inset ? '-inset' : ''}`,
		component: Component,
		width,
		height,
		fps: 30,
		durationInFrames: 1,
	};
};
