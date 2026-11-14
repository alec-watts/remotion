import {Internals} from 'remotion';

export const makeRendererPhaseLog = (testId: string, engine: string | null) => {
	const started = performance.now();
	return (phase: string) => {
		Internals.Log.info(
			{logLevel: 'info', tag: 'renderer-timeout-diagnostic'},
			'[renderer-phase]',
			testId,
			engine,
			phase,
			performance.now() - started,
		);
	};
};
