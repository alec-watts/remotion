"""Preparation-only raw-byte observer for the unchanged reported 3D comparison.

Explicit --apply is required. Caller snapshots/restores the test in finally.
No browser is launched here. Existing native capture and assertion are untouched.
"""
from pathlib import Path
import argparse,hashlib,json
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--phase',required=True,choices=['baseline','candidate']);p.add_argument('--apply',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
test=a.source/'packages/web-renderer/src/test/preserve-3d-depth.test.tsx';raw=test.read_bytes()
expected='c855af1969a12689c271cf9f4eea8bdd18225e519e948b0d7576272e36a6eaea'
assert hashlib.sha256(raw).hexdigest()==expected,'Reported test source differs from reviewed e4ab pin'
s=raw.decode()
s="import {observeGridDraws} from './grid-sampler-observer';\n"+s
sampling="""\t\t\tconst originalDrawArrays = WebGLRenderingContext.prototype.drawArrays;
\t\t\tconst originalCopy = OffscreenCanvasRenderingContext2D.prototype.drawImage;
\t\t\tconst sampling = observeGridDraws({id:'reported-perspective-filter',frame,experimental3DRendering,phase:'PHASE'});
""".replace('PHASE',a.phase)
assert s.count('\t\t\tlet actual: Blob;')==1
s=s.replace('\t\t\tlet actual: Blob;',sampling+'\t\t\tlet actual: Blob;',1)
needle_restore='\t\t\t\tshaderSpy.mockRestore();'
assert s.count(needle_restore)==1
s=s.replace(needle_restore,'\t\t\t\ttry { sampling[Symbol.dispose](); } finally { shaderSpy.mockRestore(); }',1)
needle='\t\t\tconst diff = await compareNativePixels(native, actual);';assert s.count(needle)==1
observer='''\t\t\t// Fork diagnostic only: preserve ORIGINAL encoded blobs on pass and failure.
\t\t\tfor (const [kind, blob] of [['reference', native], ['actual', actual]] as const) {
\t\t\t\tconst bytes = new Uint8Array(await blob.arrayBuffer());
\t\t\t\tlet binary = '';
\t\t\t\tfor (const byte of bytes) binary += String.fromCharCode(byte);
\t\t\t\tawait server.commands.writeFile(
\t\t\t\t\t`src/test/__screenshots__/3d-grid-diagnostic/PHASE/${server.browser}/frame-${frame}/enabled-${experimental3DRendering}/${kind}.png`,
\t\t\t\t\tbtoa(binary),
\t\t\t\t\t'base64',
\t\t\t\t);
\t\t\t}
'''.replace('PHASE',a.phase)
observer += '''\t\t\texpect(WebGLRenderingContext.prototype.drawArrays).toBe(originalDrawArrays);
\t\t\texpect(OffscreenCanvasRenderingContext2D.prototype.drawImage).toBe(originalCopy);
\t\t\tawait server.commands.writeFile(
\t\t\t\t`src/test/__screenshots__/3d-grid-diagnostic/PHASE/${server.browser}/frame-${frame}/enabled-${experimental3DRendering}/sampling.json`,
\t\t\t\tJSON.stringify({...sampling,devicePixelRatio,userAgent:navigator.userAgent,contexts:glDiagnostics}),
\t\t\t);
'''.replace('PHASE',a.phase)
if a.phase=='candidate':
 observer += '''\t\t\tif (experimental3DRendering) {
\t\t\t\texpect(sampling.records.some(record => record.min === WebGLRenderingContext.NEAREST && record.mag === WebGLRenderingContext.NEAREST), 'Guarded NEAREST must execute in the reported producer').toBe(true);
\t\t\t}
'''
s=s.replace(needle,observer+needle,1);a.output.mkdir(parents=True,exist_ok=True)
(a.output/f'{a.phase}-observed-test.tsx').write_text(s)
(a.output/f'{a.phase}-observer.json').write_text(json.dumps({'originalTestSha256':expected,'observedTestSha256':hashlib.sha256(s.encode()).hexdigest(),'source':str(test.resolve()),'phase':a.phase,'applied':a.apply,'claim':'Original blob byte retention only; native capture/comparison/assertion/source are unchanged'},indent=2)+'\n')
if a.apply:test.write_text(s)
print(json.dumps({'phase':a.phase,'applied':a.apply,'output':str(a.output.resolve())}))
