"""Timing-only observer for the exact published 13162 head; never changes assertions."""
from pathlib import Path
import hashlib,json,os,subprocess,sys

HEAD='fc54141472cd6d8de861393dc6e7ddf9f143dcc4'
TEST_SHA='16e1eb361fd34da9370072dfba40269f75dbebef1247b660583836eca035ab2d'
root=Path(sys.argv[1]).resolve()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()==HEAD
p=root/'packages/web-renderer/src/test/mask-image-url-sizing.test.tsx'
saved=p.read_bytes();assert hashlib.sha256(saved).hexdigest()==TEST_SHA
marker='// KINO-7771: Math sizes must resolve like independently authored literal sizes.'
head,tail=saved.decode().split(marker,1)
head=head.replace('import {expect, test}', 'import {expect, onTestFinished, test}').replace("import {page} from 'vitest/browser'", "import {commands, page} from 'vitest/browser'")
original='\t\t\tawait page.viewport(1280, 720);'
helper='''
            const costs: {name: string; ms: number}[] = [];
            let activePhase: {name: string; started: number} | null = null;
            onTestFinished(async () => {
                const active = activePhase as {name: string; started: number} | null;
                await commands.writeFile(
                    `validation/mask-math/hosted-phases/${t.task.file.projectName}-${math.id}-${frame}.json`,
                    JSON.stringify({engine: t.task.file.projectName, id: math.id, frame,
                        completed: costs, active: active ? {name: active.name, elapsedMs: performance.now()-active.started} : null}),
                );
            });
            const phase = async <T,>(name: string, operation: () => Promise<T>) => {
                const started = performance.now();
                activePhase = {name, started};
                try { return await operation(); }
                finally { costs.push({name, ms: performance.now()-started}); activePhase=null; }
            };
            await phase('viewport', () => page.viewport(1280, 720));'''
assert tail.count(original)==1;tail=tail.replace(original,helper)
for name,fixture in [('native-math','math'),('native-literal','literal')]:
 old=f"await captureNativeReference({fixture}, frame, {{\n\t\t\t\t\tomitBackground: transparent,\n\t\t\t\t}})";assert tail.count(old)==1
 tail=tail.replace(old,f"await phase('{name}', () => captureNativeReference({fixture}, frame, {{omitBackground: transparent}}))")
a='await compareNativePixels(reference, literalReference)';assert tail.count(a)==1;tail=tail.replace(a,"await phase('compare-native', () => compareNativePixels(reference, literalReference))")
a='await renderStillOnWeb({';assert tail.count(a)==1;tail=tail.replace(a,'await phase(`render-${composition.id}-${scale}`, () => renderStillOnWeb({',1)
a="\t\t\t\t\t\tallowHtmlInCanvas: false,\n\t\t\t\t\t});";assert tail.count(a)==1;tail=tail.replace(a,"\t\t\t\t\t\tallowHtmlInCanvas: false,\n\t\t\t\t\t}));",1)
for a,b in [('await result.canvas()','await phase(`canvas-${composition.id}-${scale}`, () => result.canvas())'),("await result.blob({format: 'png'})","await phase(`png-${composition.id}-${scale}`, () => result.blob({format: 'png'}))"),('await compareNativePixels(rendered[0], rendered[1])','await phase(`compare-export-${scale}`, () => compareNativePixels(rendered[0], rendered[1]))')]:
 assert tail.count(a)==1;tail=tail.replace(a,b)
observed=(head+marker+tail).encode()
out=root/'validation/mask-math/hosted-timing';out.mkdir(parents=True,exist_ok=True)
meta={'head':HEAD,'originalTestSha256':TEST_SHA,'observedTestSha256':hashlib.sha256(observed).hexdigest(),'observerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'command':['bun','run','testwebrenderer']}
code=1
try:
 p.write_bytes(observed)
 command=['bun','--bun','node_modules/typescript/bin/tsc','--noEmit','--emitDeclarationOnly','false','--pretty','false'] if '--static-only' in sys.argv else meta['command']
 cwd=root/'packages/web-renderer' if '--static-only' in sys.argv else root
 with (out/('static.log' if '--static-only' in sys.argv else 'full-cohort.log')).open('wb') as log:
  process=subprocess.Popen(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  for line in iter(process.stdout.readline,b''):
   log.write(line);log.flush();sys.stdout.buffer.write(line);sys.stdout.buffer.flush()
  code=process.wait()
finally:
 p.write_bytes(saved);meta['restoredTestSha256']=hashlib.sha256(p.read_bytes()).hexdigest();meta['exitCode']=code
 (out/'provenance.json').write_text(json.dumps(meta,indent=2));assert meta['restoredTestSha256']==TEST_SHA
sys.exit(code)
