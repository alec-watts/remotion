import hashlib
import json
import os
import platform
import subprocess
import threading
import time
from pathlib import Path

BASE = 'e6b9083c4984609e48db0453f3274e2123f30430'
HEAD = 'b8fc58086f18b0b58a3a22a6554af5130b82db6d'
ROOT = Path('qualification')
ROOT.mkdir(exist_ok=True)
paths = subprocess.check_output(['git', 'diff', '--name-only', '-z', BASE, HEAD])
(ROOT / 'changed-paths').write_bytes(paths)
(ROOT / 'revisions.txt').write_text(BASE + '\n' + HEAD + '\n')
helper = Path('packages/web-renderer/src/test/native-reference.tsx')
original_helper = helper.read_bytes()
results = []


def run(command, directory, log):
    with log.open('w') as output:
        return subprocess.call(command, cwd=directory, stdout=output, stderr=subprocess.STDOUT)


def observe_windows(stop, log):
    script = '''
    $tcp = Get-NetTCPConnection -ErrorAction SilentlyContinue
    $processes = Get-Process -Name chrome,bun,node,remotion -ErrorAction SilentlyContinue
    [pscustomobject]@{
      at = [DateTime]::UtcNow.ToString('o')
      tcp = @($tcp | Group-Object State | Select-Object Name,Count)
      processes = @($processes | Select-Object Id,ProcessName,WorkingSet64,Handles,CPU)
      memory = (Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize)
    } | ConvertTo-Json -Compress -Depth 5
    '''
    with log.open('w') as output:
        while not stop.is_set():
            subprocess.call(['powershell.exe', '-NoProfile', '-Command', script], stdout=output, stderr=subprocess.STDOUT)
            output.flush()
            stop.wait(2)


try:
    for arm, revision in [('main', BASE), ('published', HEAD)]:
        destination = ROOT / arm
        destination.mkdir(exist_ok=True)
        subprocess.check_call(['git', 'restore', '--source=' + revision, '--worktree', '--pathspec-from-file=' + str(ROOT / 'changed-paths'), '--pathspec-file-nul'])
        helper.write_bytes(original_helper)
        files = subprocess.check_output(['git', 'ls-files', '-z', 'packages', 'bun.lock', 'turbo.json']).decode().strip('\0').split('\0')
        hashes = {file: hashlib.sha256(Path(file).read_bytes()).hexdigest() for file in files if Path(file).is_file()}
        (destination / 'inputs.json').write_text(json.dumps(hashes, indent=2))
        (destination / 'working-diff.patch').write_bytes(subprocess.check_output(['git', 'diff', '--binary']))
        if platform.system() == 'Windows':
            # The integration code, bundle inputs, and assertions are byte-identical
            # across the two revisions. The PR changes only web-renderer and docs.
            subprocess.check_call(['git', 'diff', '--exit-code', BASE, HEAD, '--', 'packages/it-tests', 'packages/renderer', 'packages/example', 'packages/gsap', 'packages/core'])
            stop = threading.Event()
            observer = threading.Thread(target=observe_windows, args=(stop, destination / 'windows-resources.jsonl'))
            observer.start()
            try:
                code = run(['bun', 'run', 'test'], 'packages/it-tests', destination.resolve() / 'integration.log')
            finally:
                stop.set()
                observer.join()
        else:
            # Observe existing readiness checks without changing their scheduling,
            # 10-second deadline, failure outcome, or pixel assertions.
            source = original_helper.decode()
            source = source.replace('let renderError: Error | null = null;', '''let renderError: Error | null = null;
    const diagnostic = {fixture: fixture.id, frame, start: performance.now(), frames: 0, maxFrameGap: 0, lastFrame: performance.now()};''')
            source = source.replace("throw new Error('Native reference remained pending or buffering');", "throw new Error('Native reference remained pending or buffering ' + JSON.stringify({...diagnostic, elapsed: performance.now() - diagnostic.start, ready: delayRenderScope.remotion_renderReady, handles: delayRenderScope.remotion_delayRenderHandles, buffering: readBuffering?.(), visibility: document.visibilityState, focused: document.hasFocus(), width: innerWidth, height: innerHeight}));")
            source = source.replace('\t\tcheckReadyError();', '''        diagnostic.frames++;
        diagnostic.maxFrameGap = Math.max(diagnostic.maxFrameGap, performance.now() - diagnostic.lastFrame);
        diagnostic.lastFrame = performance.now();
        checkReadyError();''')
            source = source.replace('\t} finally {\n\t\ttry {\n\t\t\troot.unmount();', '''    } finally {
        if (fixture.id === 'transform-geometric-2d') console.log('native-readiness-observation', JSON.stringify({...diagnostic, elapsed: performance.now() - diagnostic.start}));
        try {
            root.unmount();''', 1)
            assert source.count('native-readiness-observation') == 1
            helper.write_text(source)
            (destination / 'native-reference-instrumented.tsx').write_text(source)
            code = run(['bun', 'run', 'testwebrenderer', '--log-order=stream'], '.', destination / 'renderer.log')
        helper.write_bytes(original_helper)
        after = {file: hashlib.sha256(Path(file).read_bytes()).hexdigest() for file in hashes}
        assert hashes == after, 'Tracked inputs changed during the run'
        (destination / 'status.txt').write_text(str(code) + '\n')
        results.append({'arm': arm, 'revision': revision, 'exit': code})
finally:
    helper.write_bytes(original_helper)
    subprocess.check_call(['git', 'restore', '--source=' + HEAD, '--worktree', '--pathspec-from-file=' + str(ROOT / 'changed-paths'), '--pathspec-file-nul'])
    (ROOT / 'results.json').write_text(json.dumps(results, indent=2))

if len(results) != 2 or any(row['exit'] != 0 for row in results):
    raise SystemExit(1)
