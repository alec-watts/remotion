from pathlib import Path
import sys

mode, original = sys.argv[1:]
assert mode in ['original', 'adaptive']
source = Path(original).read_text()
needle = 'maxWorkers: process.env.CI ? 2 : 5,'
assert source.count(needle) == 1
if mode == 'adaptive':
    source = "import {availableParallelism} from 'node:os';\n" + source
    source = source.replace(needle, 'maxWorkers: process.env.CI ? Math.min(2, Math.max(1, Math.floor(availableParallelism() / 2))) : 5,')
Path('packages/web-renderer/vitest.config.ts').write_text(source)
