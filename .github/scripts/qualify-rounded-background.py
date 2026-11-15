from pathlib import Path

test = Path('packages/web-renderer/src/test/background-clip.test.tsx')
source = test.read_text()
assert source.count("test('should render background-clip: text") == 2
results = Path('packages/web-renderer/test/__results__')
results.mkdir(parents=True, exist_ok=True)
(results / 'original-background-test.tsx').write_text(source)
source = source.replace("import {page} from 'vitest/browser';", "import {page, server} from 'vitest/browser';")
source = source.replace("import {testImage} from './utils';", "import {testImage} from './utils';\nimport {captureNativeReference, compareNativePixels} from './native-reference';")
needle = '\n\tawait testImage({'
assert source.count(needle) == 2
record = '''
    const directory = 'test/__results__/rounded-background/' + server.browser + '/SCALE';
    let binary = '';
    for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
    await server.commands.writeFile(directory + '/actual.png', btoa(binary), 'base64');
    await server.commands.writeFile(directory + '/runtime.json', JSON.stringify({
        browser: server.browser, platform: server.platform, runtime: server.version,
        userAgent: navigator.userAgent, devicePixelRatio, frame: 0, scale: SCALE,
        width: backgroundClipText.width * SCALE, height: backgroundClipText.height * SCALE,
    }, null, 2));
'''
native = '''
    const reference = await captureNativeReference(backgroundClipText, 0, {omitBackground: false});
    const comparison = await compareNativePixels(reference, blob);
    for (const [name, png] of [['reference', reference], ['diff', comparison.diff]] as const) {
        let data = '';
        for (const byte of new Uint8Array(await png.arrayBuffer())) data += String.fromCharCode(byte);
        await server.commands.writeFile(directory + '/' + name + '.png', btoa(data), 'base64');
    }
    await server.commands.writeFile(directory + '/comparison.json', JSON.stringify({
        mismatchedPixels: comparison.mismatchedPixels, maxChannelDelta: comparison.maxChannelDelta,
    }, null, 2));
'''
parts = source.split(needle)
source = parts[0] + record.replace(' * SCALE', '').replace('SCALE', '1') + native + needle + parts[1] + record.replace('SCALE', '2') + needle + parts[2]
test.write_text(source)
