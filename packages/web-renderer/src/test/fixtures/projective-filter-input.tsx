import React from 'react';
import {AbsoluteFill} from 'remotion';

export const filterInputCases = [
	{kind: 'scaled', left: -100, transform: 'translateX(-150px) scaleX(2)'},
	{kind: 'reflected', left: 400, transform: 'translateX(150px) scaleX(-2)'},
	{
		kind: 'skewed',
		left: -100,
		transform: 'translateX(-150px) scaleX(2) skewY(10deg)',
	},
	{
		kind: 'projective',
		left: -100,
		transform: 'translateX(-150px) scaleX(2) rotateY(20deg)',
	},

	{
		kind: 'projective-front',
		left: -100,
		transform: 'translateX(-150px) scaleX(2) rotateY(-20deg)',
	},
	{kind: 'rounded', left: -100, transform: 'translateX(-150px) scaleX(2)'},
	{kind: 'gradient', left: -100, transform: 'translateX(-150px) scaleX(2)'},
	{kind: 'blurred', left: -100, transform: 'translateX(-150px) scaleX(2)'},
	{kind: 'text', left: -100, transform: 'translateX(-150px) scaleX(2)'},
	{
		kind: 'fractional',
		left: -100.25,
		transform: 'translateX(-130px) scale(1.5, 0.75)',
	},

	{kind: 'gradient-visible', left: 25, transform: 'scaleX(2)'},
	{kind: 'text-visible', left: 25, transform: 'scaleX(2)'},
	{kind: 'rounded-visible', left: 25, transform: 'scaleX(2)'},
	{kind: 'texture-visible', left: 25, transform: 'scaleX(2)'},
	{kind: 'masked-visible', left: 25, transform: 'scale(2, 0.75)'},
] as const;

export const projectiveFilterInput = (
	kind: (typeof filterInputCases)[number]['kind'],
	preserving: boolean,
	position: {left: number; top: number; shadowOffset: number} | null = null,
	geometry: {
		transform: string;
		perspective?: number;
		willChange?: 'transform';
		order?: 'transform-outside' | 'filter-outside';
		paint?: 'filtered' | 'source-only' | 'blue-text';
		mixedMarkup?: 'textured' | 'rounded-clip' | 'masked';
	} | null = null,
) => {
	const scene = filterInputCases.find((item) => item.kind === kind)!;
	const left = position?.left ?? scene.left;
	const top = position?.top ?? (kind === 'fractional' ? 100.25 : 100);
	const width = kind === 'fractional' ? 50.5 : 50;
	const height = kind === 'fractional' ? 49.25 : 50;
	const transform = geometry?.transform ?? scene.transform;
	const order = geometry?.order;
	const paint = geometry?.paint ?? 'filtered';
	const mixedMarkup = geometry?.mixedMarkup;
	const filter =
		paint !== 'filtered'
			? undefined
			: kind === 'blurred'
				? 'blur(2px) drop-shadow(150px 0 0 blue)'
				: kind.endsWith('visible')
					? `drop-shadow(${position?.shadowOffset ?? 60}px 0 0 blue)`
					: 'drop-shadow(150px 0 0 blue)';
	const Component: React.FC = () => {
		const source = (
			<div
				data-mask-stage={mixedMarkup ? 'content' : undefined}
				style={{
					position: 'absolute',
					left: order ? 0 : left,
					top: order ? 0 : top,
					width,
					height,
					backgroundColor:
						kind.startsWith('text') || kind === 'masked-visible'
							? 'transparent'
							: 'red',
					backgroundImage: kind.startsWith('gradient')
						? 'linear-gradient(90deg, red, lime)'
						: kind === 'texture-visible'
							? 'repeating-linear-gradient(45deg, red 0px, red 3px, white 3px, white 6px)'
							: undefined,
					borderRadius: kind.startsWith('rounded') ? 20 : 0,
					fontSize: 24,
					color: paint === 'blue-text' ? 'blue' : 'red',
					transform: order === 'transform-outside' ? undefined : transform,
					transformOrigin: '0 0',
					willChange: geometry?.willChange,
					filter: order === 'filter-outside' ? undefined : filter,
				}}
			>
				{mixedMarkup ? (
					<div
						data-mask-stage="texture"
						style={{
							position: 'absolute',
							inset: '1px 3px 4px 2px',
							backgroundImage:
								'repeating-linear-gradient(35deg, #fee295 0px, #fee295 4px, #93d7f9 4px, #93d7f9 8px)',
							borderRadius:
								mixedMarkup === 'rounded-clip'
									? '16px 12px 5px 9px'
									: undefined,
							overflow: mixedMarkup === 'rounded-clip' ? 'hidden' : undefined,
							maskImage:
								mixedMarkup === 'masked'
									? 'linear-gradient(0deg, transparent, black 75%), linear-gradient(90deg, black 65%, transparent)'
									: undefined,
							maskComposite: mixedMarkup === 'masked' ? 'intersect' : undefined,
						}}
					>
						<span style={{position: 'absolute', left: 1, top: -4}}>Aa</span>
					</div>
				) : kind.startsWith('text') ? (
					'Aa'
				) : null}
				{kind === 'masked-visible' ? (
					<div
						style={{
							position: 'absolute',
							left: 0.5,
							top: 0.25,
							width: 48,
							height: 46,
							backgroundColor: 'red',
							maskImage: 'linear-gradient(90deg, black, transparent)',
						}}
					/>
				) : null}
			</div>
		);

		return (
			<AbsoluteFill
				style={{
					backgroundColor: 'white',
					perspective:
						geometry?.perspective ??
						(kind.startsWith('projective') ? 400 : undefined),
					transformStyle: preserving ? 'preserve-3d' : 'flat',
				}}
			>
				{order ? (
					<div
						data-mask-stage={mixedMarkup ? 'outer' : undefined}
						style={{
							position: 'absolute',
							left,
							top,
							width,
							height,
							transform: order === 'transform-outside' ? transform : undefined,
							transformOrigin: '0 0',
							filter: order === 'filter-outside' ? filter : undefined,
						}}
					>
						{source}
					</div>
				) : (
					source
				)}
			</AbsoluteFill>
		);
	};

	return {
		component: Component,
		id: `filter-input-${kind}-${preserving ? 'preserving' : 'flat'}${position ? `-${position.left}-${position.top}-${position.shadowOffset}` : ''}${paint === 'filtered' ? '' : `-${paint}`}${order ? `-${order}` : ''}${mixedMarkup ? `-${mixedMarkup}` : ''}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 1,
	} as const;
};
