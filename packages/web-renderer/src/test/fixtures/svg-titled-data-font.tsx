import {useEffect, useState} from 'react';
import {AbsoluteFill, useDelayRender} from 'remotion';

const sources = Promise.all(
	[
		new URL('../../../../example/public/bangers.woff2', import.meta.url).href,
		new URL('../../../../example/public/Roboto-Medium.ttf', import.meta.url)
			.href,
	].map(async (url) => {
		const blob = await (await fetch(url)).blob();
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(blob);
		});
	}),
);

export const svgTitledDataFont = (firstRoboto: boolean, literal: boolean) => {
	const Component = () => {
		const {delayRender, continueRender, cancelRender} = useDelayRender();
		const [handle] = useState(() =>
			delayRender('Loading titled data-font sources'),
		);
		const [data, setData] = useState<string[] | null>(null);
		const family = `Titled data review ${firstRoboto ? 'Roboto' : 'Bangers'}`;
		useEffect(() => {
			let active = true;
			sources
				.then((value) => {
					if (active) setData(value);
				})
				.catch((error) => {
					if (active) cancelRender(error);
				});
			return () => {
				active = false;
				continueRender(handle);
			};
		}, [cancelRender, continueRender, handle]);
		useEffect(() => {
			if (data === null) return;
			let active = true;
			document.fonts
				.load(`40px "${family}"`)
				.then((faces) => {
					if (faces.length === 0)
						throw new Error('Preferred data font was not available');
					if (active) continueRender(handle);
				})
				.catch((error) => {
					if (active) cancelRender(error);
				});
			return () => {
				active = false;
			};
		}, [cancelRender, continueRender, data, family, handle]);
		if (data === null) return null;
		const preferred = data[firstRoboto ? 1 : 0];
		const inactive = data[firstRoboto ? 0 : 1];
		return (
			<AbsoluteFill style={{backgroundColor: 'white'}}>
				<svg width={320} height={100}>
					<style
						title={literal ? undefined : 'preferred-data-font'}
					>{`@font-face{font-family:"${family}";src:url("${preferred}")} rect{fill:lime}`}</style>
					{literal ? null : (
						<style title="inactive-data-font">{`@font-face{font-family:"${family}";src:url("${inactive}")} rect{fill:red}`}</style>
					)}
					<text x={8} y={60} fontFamily={family} fontSize={40} fill="black">
						Title Font
					</text>
					<rect x={290} y={80} width={20} height={10} />
				</svg>
			</AbsoluteFill>
		);
	};

	return {
		component: Component,
		id: `svg-titled-data-${firstRoboto ? 'roboto' : 'bangers'}-${literal ? 'literal' : 'titled'}`,
		width: 320,
		height: 100,
		durationInFrames: 1,
		fps: 30,
	} as const;
};
