import {AbsoluteFill} from 'remotion';
import type {filterInputCases} from './projective-filter-input';
import {projectiveFilterInput} from './projective-filter-input';

export const projectiveFilterAnchored = (
	kind: (typeof filterInputCases)[number]['kind'],
	preserving: boolean,
	identityTransform: boolean | null = null,
) => {
	const fixture = projectiveFilterInput(kind, preserving);
	const Scene = fixture.component;
	return {
		...fixture,
		id: `${fixture.id}-anchored${identityTransform ? '-identity' : ''}`,
		component: () => (
			<AbsoluteFill
				style={{
					backgroundColor: 'white',
					transform: identityTransform ? 'scale(1)' : undefined,
				}}
			>
				<Scene />
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: 8,
						height: 8,
						backgroundColor: 'rgb(0, 170, 85)',
					}}
				/>
			</AbsoluteFill>
		),
	};
};

export const projectiveFilterSvgCarrier = (
	kind: (typeof filterInputCases)[number]['kind'],
	preserving: boolean,
	onSource: ((element: SVGSVGElement | null) => void) | null = null,
	identityTransform: boolean | null = null,
) => {
	const fixture = projectiveFilterAnchored(kind, preserving, identityTransform);
	const Scene = fixture.component;
	return {
		...fixture,
		id: `${fixture.id}-svg`,
		component: () => (
			<svg
				ref={onSource}
				width={fixture.width}
				height={fixture.height}
				viewBox={`0 0 ${fixture.width} ${fixture.height}`}
			>
				<foreignObject width={fixture.width} height={fixture.height}>
					<Scene />
				</foreignObject>
			</svg>
		),
	};
};
