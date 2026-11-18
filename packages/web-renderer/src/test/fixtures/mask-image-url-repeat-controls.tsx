import {maskImageUrlRepeat} from './mask-image-url-repeat';

const Source = maskImageUrlRepeat.component;
export const rasterMaskRepeatControls = [
	'repeat',
	'no-repeat',
	'repeat-x',
	'repeat-y',
].map((kind) => ({
	kind,
	fixture: {
		...maskImageUrlRepeat,
		id: `mask-repeat-control-${kind}`,
		component: () => (
			<>
				<style>{`[data-raster-mask-repeat] { mask-repeat: ${kind} !important; } [style*="background-repeat:"] { background-repeat: ${kind} !important; }`}</style>
				<Source />
			</>
		),
	},
}));
