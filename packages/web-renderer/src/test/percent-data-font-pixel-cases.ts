import {expect, test, vi} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import * as fontGroups from '../drawing/fingerprint-css-font-groups';
import {renderStillOnWeb} from '../render-still-on-web';
import {
	svgPercentDataFont,
	svgPercentDataFontEncodings,
} from './fixtures/svg-percent-data-font';
import {createFontFailureRecorder} from './font-failure-recorder';
import {
	captureNativeReference,
	compareNativePixels,
	countNativePixels,
} from './native-reference';

vi.mock('../drawing/fingerprint-css-font-groups', {spy: true});

export const registerPercentDataFontPixelCases = (
	preferredTitle: 'A' | 'B',
	strictNative: boolean,
) => {
	const variants = svgPercentDataFontEncodings.map((encoding) => ({
		encoding,
		preferred: preferredTitle,
	}));
	test.for(
		variants.flatMap((variant) => [0, 1].map((frame) => ({...variant, frame}))),
	)(
		'preserves $encoding titled $preferred frame $frame',
		async ({encoding, preferred, frame}, context) => {
			const failure = createFontFailureRecorder(context);
			const trace: unknown[] = [];
			const composition = svgPercentDataFont(encoding, preferred, null, false);
			const literal = svgPercentDataFont(encoding, preferred, preferred, false);
			const fallback = svgPercentDataFont(encoding, preferred, preferred, true);
			const native = await captureNativeReference(composition, frame, {
				omitBackground: false,
			});
			const opposite = svgPercentDataFont(
				encoding,
				preferred,
				preferred === 'A' ? 'B' : 'A',
				false,
			);
			const oppositeNative = await captureNativeReference(opposite, frame, {
				omitBackground: false,
			});
			const nativeLiteral = await captureNativeReference(literal, frame, {
				omitBackground: false,
			});
			const repeat = await captureNativeReference(composition, frame, {
				omitBackground: false,
			});
			const render = async (target: typeof composition, stage: string) => {
				const spy = vi.mocked(fontGroups.fingerprintCssFontGroups);
				spy.mockClear();
				const output = (
					await renderStillOnWeb({
						composition: target,
						frame,
						inputProps: {},
						licenseKey: 'free-license',
						allowHtmlInCanvas: false,
					})
				).blob({format: 'png'});
				trace.push({
					stage,
					calls: spy.mock.calls.map(([, samples, groups], index) => ({
						result: spy.mock.results[index],
						samples: samples.map((sample) => ({
							text: sample.text,
							font: sample.style.font,
							family: sample.style.fontFamily,
						})),
						groups: groups.map((group) => ({
							name: group.name,
							rules: group.rules.map((rule) => ({
								family: rule.style.fontFamily,
								title: rule.parentStyleSheet?.title,
								srcPrefix: rule.style.getPropertyValue('src').slice(0, 100),
								srcLength: rule.style.getPropertyValue('src').length,
							})),
						})),
					})),
				});
				spy.mockClear();
				return output;
			};
			const actual = await render(composition, 'actual');
			const literalActual = await render(literal, 'literal');
			const fallbackActual = await render(fallback, 'fallback');
			const results = {
				nativeLiteral: await compareNativePixels(native, nativeLiteral),
				repeat: await compareNativePixels(native, repeat),
				nativeActual:
					strictNative || context.task.file.projectName === 'chromium'
						? await compareNativePixels(native, actual)
						: await countNativePixels(native, actual),
				literalActual: await compareNativePixels(literalActual, actual),
			};
			const tracePath = `test/__results__/font-selection/${server.browser}/${encoding}-${preferred}-${frame}-${crypto.randomUUID()}`;
			await server.commands.writeFile(
				`${tracePath}/fingerprint.json`,
				JSON.stringify({encoding, preferred, frame, trace}),
			);
			failure.record('fingerprint.json', JSON.stringify(trace));
			for (const [name, blob] of Object.entries({
				native,
				nativeLiteral,
				oppositeNative,
				repeat,
				actual,
				literalActual,
				fallbackActual,
			})) {
				await failure.png(
					`${encoding}-${preferred}-${frame}-${name}.png`,
					blob,
				);
			}

			failure.record(
				`${encoding}-${preferred}-${frame}-result.json`,
				JSON.stringify(
					Object.fromEntries(
						Object.entries(results).map(([key, value]) => [
							key,
							{pixels: value.mismatchedPixels, maxDelta: value.maxChannelDelta},
						]),
					),
				),
			);
			expect(
				(await countNativePixels(literalActual, fallbackActual))
					.mismatchedPixels,
			).toBeGreaterThan(0);
			expect(
				(await countNativePixels(native, oppositeNative)).mismatchedPixels,
			).toBeGreaterThan(0);
			for (const [comparison, result] of Object.entries(results)) {
				if (
					comparison === 'nativeActual' &&
					!strictNative &&
					context.task.file.projectName !== 'chromium'
				)
					continue;
				expect(result.mismatchedPixels).toBe(0);
				expect(result.maxChannelDelta).toBe(0);
			}
		},
	);
};
