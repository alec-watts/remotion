"""Run the unchanged Linux lifetime guards before/after the reviewed oracle fix."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

HEAD = '4ed07575b2ac7489f3510964ec590533d3ac8320'
root = Path(sys.argv[1]).resolve()
control = Path(sys.argv[2]).resolve()
proof = root / 'validation/font-oracle-linux'
proof.mkdir(parents=True, exist_ok=True)
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() == HEAD
assert subprocess.check_output(['bun', '--version'], text=True).strip() == '1.4.3'
assert subprocess.check_output(['node', '--version'], text=True).strip() == 'v26.13.0'
paths = [
    'packages/web-renderer/src/test/fixtures/svg-font-family-lifetime.tsx',
    'packages/web-renderer/src/test/svg-registered-font-selection.test.ts',
]
expected_old = {
    paths[0]: '0a2b2aabd233ffb075fd61d6dd0ca1f28e9f298fc848b46680f8df51daed8a5b',
    paths[1]: 'efddbdbc511a564a5f2fba57d38b74f1681cd71deb58281f0ff13a7cf2960c5e',
}
expected_new = {
    paths[0]: '50f281ad476f894e22d2d4e00345f412ebb479e506bbdc1d6129afbc96c65890',
    paths[1]: 'c90f4a6703e2d940ae5134cbccf5986fe6a1da133689db73ba4907c08f6af23d',
}
saved = {name: (root / name).read_bytes() for name in paths}
sha = lambda data: hashlib.sha256(data).hexdigest()
actual_old = {name: sha(data) for name, data in saved.items()}
assert actual_old == expected_old, actual_old
patch = control / '.github/diagnostics/svg-font-generic-oracle.patch'
config = root / 'packages/web-renderer/vitest.font-oracle-linux.config.ts'
assert not config.exists()
chrome = os.environ['ORACLE_CHROME']
config.write_text("""import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';
import base from './vitest.config';
export default defineConfig({
 ...base,
 test: {
  ...base.test,
  maxWorkers: 1,
  browser: {
   ...base.test?.browser,
   instances: [{
    browser: 'chromium', viewport: {width: 1280, height: 720},
    provider: playwright({launchOptions: {
     executablePath: process.env.ORACLE_CHROME!, chromiumSandbox: true,
    }, actionTimeout: 5000}),
   }],
  },
 },
});
""")
manifest_paths = paths + ['bun.lock', 'package.json',
    'packages/web-renderer/src/drawing/embed-registered-fonts-in-svg.ts',
    'packages/web-renderer/src/drawing/turn-svg-into-drawable.ts']
manifest = {name: sha((root / name).read_bytes()) for name in manifest_paths}
metadata = {
    'head': HEAD, 'workflowCommit': os.environ.get('GITHUB_SHA'),
    'before': manifest, 'expectedAfter': expected_new,
    'patchSha256': sha(patch.read_bytes()),
    'chrome': subprocess.check_output([chrome, '--version'], text=True).strip(),
    'playwright': subprocess.check_output(['bun', '--print',
        'require("playwright/package.json").version'], cwd=root / 'packages/web-renderer', text=True).strip(),
    'bun': subprocess.check_output(['bun', '--revision'], text=True).strip(),
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'sandbox': True, 'fontFlags': [], 'testDeadlineChanged': False,
}
assert metadata['playwright'] == '1.60.0', metadata
assert '156.0.8078.79' in metadata['chrome'], metadata
(proof / 'provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')
results = {}
try:
    for phase in ['original', 'corrected']:
        if phase == 'corrected':
            subprocess.run(['git', 'apply', '--check', str(patch)], cwd=root, check=True)
            subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
            actual = {name: sha((root / name).read_bytes()) for name in paths}
            assert actual == expected_new, actual
        command = ['bun', '--bun', 'node_modules/vitest/vitest.mjs', 'run',
            '--config', config.name, 'src/test/svg-registered-font-selection.test.ts',
            '--maxWorkers=1', '--reporter=default', '--reporter=json',
            '--outputFile=' + str(proof / (phase + '.json'))]
        with (proof / (phase + '.log')).open('w') as log:
            result = subprocess.run(command, cwd=root / 'packages/web-renderer',
                stdout=log, stderr=subprocess.STDOUT)
        record = {'exitCode': result.returncode, 'command': command,
            'hashes': {name: sha((root / name).read_bytes()) for name in manifest_paths}}
        if (proof / (phase + '.json')).exists():
            report = json.loads((proof / (phase + '.json')).read_text())
            record['passed'] = report['numPassedTests']
            record['failed'] = report['numFailedTests']
            record['failures'] = [
                {'name': case['fullName'], 'messages': case['failureMessages']}
                for file in report['testResults'] for case in file['assertionResults']
                if case['status'] == 'failed']
        results[phase] = record
        (proof / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
    config.unlink(missing_ok=True)
    restored = {name: sha((root / name).read_bytes()) for name in manifest_paths}
    assert restored == manifest, restored
    (proof / 'restore-proof.json').write_text(json.dumps(restored, indent=2) + '\n')

old = results['original']
new = results['corrected']
assert old.get('failed') == 2 and old.get('passed') == 4, old
assert all(any(token in item['name'] for token in [
    'font-family snapshots follow removal', 'frame 1']) for item in old['failures']), old
assert old['exitCode'] != 0, old
assert new['exitCode'] == 0 and new.get('passed') == 6 and new.get('failed') == 0, new
