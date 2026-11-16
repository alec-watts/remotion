from pathlib import Path
import json

turbo = Path('turbo.json')
settings = json.loads(turbo.read_text())
settings.setdefault('globalEnv', [])
if 'REMOTION_DIAGNOSTIC_CHROME_EXECUTABLE' not in settings['globalEnv']:
    settings['globalEnv'].append('REMOTION_DIAGNOSTIC_CHROME_EXECUTABLE')
turbo.write_text(json.dumps(settings, indent='\t') + '\n')

guard = """const diagnosticChrome = process.env.REMOTION_DIAGNOSTIC_CHROME_EXECUTABLE;
if (!diagnosticChrome) throw new Error('Pinned diagnostic Chrome was not passed to the test process');

"""

config = Path('packages/web-renderer/vitest.config.ts')
source = config.read_text()
needle = "\t\t\t\t\t\t\tchannel: 'chrome',"
assert source.count(needle) == 1
source = source.replace(needle, needle + '\n\t\t\t\t\t\t\texecutablePath: diagnosticChrome,')
assert source.count('export default defineConfig(') == 1
source = source.replace('export default defineConfig(', guard + 'export default defineConfig(')
config.write_text(source)

info = Path('packages/web-renderer/test/browser-info.ts')
source = info.read_text()
needle = "chromium.launch({channel: 'chrome', headless: true})"
assert source.count(needle) == 1
source = source.replace(needle, "chromium.launch({channel: 'chrome', executablePath: diagnosticChrome, headless: true})")
source = source.replace('const browser = await chromium.launch', guard + 'const browser = await chromium.launch')
source = source.replace('chrome: browser.version(),', 'chrome: browser.version(), executablePath: diagnosticChrome,')
info.write_text(source)

react_config = Path('packages/react18-tests/vitest.config.ts')
source = react_config.read_text()
if "channel: 'chrome'," in source:
    assert source.count("channel: 'chrome',") == 1
    source = source.replace("channel: 'chrome',", "channel: 'chrome', executablePath: diagnosticChrome,")
    assert source.count('export default defineConfig(') == 1
    source = source.replace('export default defineConfig(', guard + 'export default defineConfig(')
    react_config.write_text(source)
