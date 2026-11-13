import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

export const backfaceNativeCases = [
	'front',
	'back-hidden',
	'back-visible',
	'reflect-x',
	'reflect-z',
	'nested-double-turn',
	'flat-double-turn',
	'hidden-parent-front-child',
	'back-hidden-preserve',
	'back-hidden-perspective',
	'perspective-front',
	'matrix-front',
	'matrix-back',
	'perspective-front-parent-3d',
	'perspective-front-layer',
	'back-hidden-layer',
	'back-hidden-parent-3d',
] as const;

export const backfaceNative = (
	variant: (typeof backfaceNativeCases)[number],
) => {
	let markup = '';
	let compositionMarkup = '';
	let ancestors: string[] = [];
	let computed: Record<string, string> = {};
	const Component = () => {
		const frame = useCurrentFrame();
		const perspectiveFront = variant.startsWith('perspective-front');
		const nested =
			variant === 'nested-double-turn' ||
			variant === 'flat-double-turn' ||
			variant === 'hidden-parent-front-child';
		const transform =
			variant === 'matrix-front'
				? 'matrix3d(1,0,-1,0, 0,1,0,0, 2,0,-1,0, 0,0,0,1)'
				: variant === 'matrix-back'
					? 'matrix3d(1,0,1,0, 0,1,0,0, 2,0,1,0, 0,0,0,1)'
					: perspectiveFront
						? 'perspective(200px) translateX(-100px) rotateY(100deg)'
						: variant === 'reflect-x'
							? 'scaleX(-1)'
							: variant === 'reflect-z'
								? 'scaleZ(-1)'
								: variant === 'front'
									? 'rotateY(0deg)'
									: 'rotateY(180deg)';
		const style: CSSProperties = {
			position: 'absolute',
			left: (perspectiveFront ? 200 : 100) + frame,
			top: 100,
			width: 100,
			height: 100,
			backgroundColor: nested ? 'red' : 'blue',
			transform,
			transformOrigin: perspectiveFront ? '0px 0px' : '50px 50px',
			willChange: variant.endsWith('-layer') ? 'transform' : 'auto',
			backfaceVisibility:
				variant === 'back-visible' || nested
					? variant === 'hidden-parent-front-child'
						? 'hidden'
						: 'visible'
					: 'hidden',
			transformStyle:
				(nested && variant !== 'flat-double-turn') ||
				variant === 'back-hidden-preserve'
					? 'preserve-3d'
					: 'flat',
		};
		return (
			<AbsoluteFill
				style={{
					backgroundColor: 'white',
					perspective: variant === 'back-hidden-perspective' ? '500px' : 'none',
					transformStyle: variant.endsWith('-parent-3d')
						? 'preserve-3d'
						: 'flat',
				}}
			>
				<div
					style={style}
					ref={(node) => {
						if (!node) return;
						markup = node.outerHTML;
						compositionMarkup = node.parentElement!.outerHTML;
						const style = getComputedStyle(node);
						computed = Object.fromEntries(
							[
								'transform',
								'transform-origin',
								'transform-style',
								'backface-visibility',
								'-webkit-backface-visibility',
								'perspective',
								'will-change',
							].map((name) => [name, style.getPropertyValue(name)]),
						);
						const matrix = new DOMMatrixReadOnly(style.transform);
						computed.forwardM33 = String(matrix.m33);
						computed.inverseM33 = String(matrix.inverse().m33);
						const bounds = node.getBoundingClientRect();
						const parentBounds = node.parentElement!.getBoundingClientRect();
						computed.boundsRelativeToParent = JSON.stringify({
							left: bounds.left - parentBounds.left,
							top: bounds.top - parentBounds.top,
							width: bounds.width,
							height: bounds.height,
						});
						ancestors = [];
						for (
							let parent = node.parentElement;
							parent;
							parent = parent.parentElement
						) {
							const clone = parent.cloneNode(false) as Element;
							ancestors.push(clone.outerHTML);
						}
					}}
				>
					{nested ? (
						<div
							style={{
								width: 100,
								height: 100,
								backgroundColor: 'blue',
								transform: 'rotateY(180deg)',
								transformOrigin: '50px 50px',
								backfaceVisibility: 'hidden',
							}}
						/>
					) : null}
				</div>
			</AbsoluteFill>
		);
	};
	return {
		getNativeMarkup: () => ({markup, compositionMarkup, ancestors, computed}),
		component: Component,
		id: `backface-native-${variant}`,
		width: 300,
		height: 300,
		fps: 30,
		durationInFrames: 2,
	} as const;
};
