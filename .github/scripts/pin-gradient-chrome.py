from pathlib import Path

config = Path('packages/web-renderer/vitest.config.ts')
source = config.read_text()
needle = "\t\t\t\t\t\t\tchannel: 'chrome',"
assert source.count(needle) == 1
source = source.replace(needle, needle + '\n\t\t\t\t\t\t\texecutablePath: process.env.REMOTION_DIAGNOSTIC_CHROME_EXECUTABLE,')
config.write_text(source)

info = Path('packages/web-renderer/test/browser-info.ts')
source = info.read_text()
needle = "chromium.launch({channel: 'chrome', headless: true})"
assert source.count(needle) == 1
source = source.replace(needle, "chromium.launch({channel: 'chrome', executablePath: process.env.REMOTION_DIAGNOSTIC_CHROME_EXECUTABLE, headless: true})")
info.write_text(source)

react_config = Path('packages/react18-tests/vitest.config.ts')
source = react_config.read_text()
if "channel: 'chrome'," in source:
    assert source.count("channel: 'chrome',") == 1
    source = source.replace("channel: 'chrome',", "channel: 'chrome', executablePath: process.env.REMOTION_DIAGNOSTIC_CHROME_EXECUTABLE,")
    react_config.write_text(source)
