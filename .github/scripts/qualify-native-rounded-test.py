from pathlib import Path
test = Path('packages/web-renderer/src/test/border-radius.test.tsx')
source = test.read_text()
marker = "test('renders CSS corners with native rounded clipping'"
assert source.count(marker) == 1
body = source[source.index(marker):]
assert body.count('test(') == 1
needle = '\t\tconst comparison = await compareNativePixels(reference, actual);'
assert body.count(needle) == 1
prefix = """import {expect, test} from 'vitest';
import {server} from 'vitest/browser';
import '../symbol-dispose';
import {renderStillOnWeb} from '../render-still-on-web';
import {nativeRoundedClipping, nativeRoundedClipCases} from './fixtures/border-radius';
import {compareNativePixels} from './native-reference';

"""
logging = """
        const directory = 'test/__results__/rounded-public/' + server.browser;
        for (const [name, blob] of [['reference', reference], ['actual', actual], ['diff', comparison.diff]] as const) {
            let binary = '';
            for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
            await server.commands.writeFile(directory + '/' + name + '.png', btoa(binary), 'base64');
        }
        await server.commands.writeFile(directory + '/comparison.json', JSON.stringify({
            browser: server.browser, platform: server.platform, runtime: server.version,
            userAgent: navigator.userAgent, devicePixelRatio, frame,
            width: nativeRoundedClipping.width, height: nativeRoundedClipping.height,
            oracle: 'Canvas roundRect with explicit normalized radii',
            capturePath: 'software DOM composer',
            mismatchedPixels: comparison.mismatchedPixels, maxChannelDelta: comparison.maxChannelDelta,
        }, null, 2));
"""
results = Path('packages/web-renderer/test/__results__')
results.mkdir(parents=True, exist_ok=True)
(results / 'public-test.tsx').write_text(source)
(results / 'public-regression-body.tsx').write_text(body)
driver = Path('packages/web-renderer/src/test/native-rounded-clipping-qualification.test.tsx')
assert not driver.exists()
driver.write_text(prefix + body.replace(needle, needle + logging))
