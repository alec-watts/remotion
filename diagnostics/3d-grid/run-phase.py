"""Fork diagnostic only. No retries; exact source/test hashes and positive bytes."""
from pathlib import Path
import argparse,hashlib,json,os,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('phase',choices=['baseline','candidate']);a=p.parse_args();r=Path.cwd();capsule=Path(os.environ['GITHUB_WORKSPACE'])/'diagnostic/diagnostics/3d-grid';out=Path(os.environ['GITHUB_WORKSPACE'])/'diagnostic-output'/a.phase;out.mkdir(parents=True,exist_ok=False);manifest=json.loads((capsule/'source-manifest.json').read_text());test=r/'packages/web-renderer/src/test/preserve-3d-depth.test.tsx';test_original=test.read_bytes();helper=r/'packages/web-renderer/src/test/grid-sampler-observer.ts';assert not helper.exists();sources={r/f['path']:(r/f['path']).read_bytes()for f in manifest['files']}
sha=lambda b:hashlib.sha256(b).hexdigest()
try:
 assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==manifest['base']
 for f in manifest['files']:assert sha((r/f['path']).read_bytes())==f['baseSha256']
 if a.phase=='candidate':subprocess.run(['git','apply',str(capsule/'source-review.patch')],check=True)
 for f in manifest['files']:assert sha((r/f['path']).read_bytes())==f[a.phase+'Sha256' if a.phase=='candidate' else 'baseSha256']
 helper.write_bytes((capsule/'grid-sampler-observer.ts').read_bytes())
 subprocess.run([sys.executable,str(capsule/'instrument-positive-pngs.py'),str(r),'--phase',a.phase,'--output',str(out/'observer'),'--apply'],check=True)
 with(out/'tests.log').open('w')as log:
  result=subprocess.run(['bunx','vitest','src/test/preserve-3d-depth.test.tsx','--browser','--run','--reporter=default','--reporter=json','--outputFile='+str(out/'tests.json')],cwd=r/'packages/web-renderer',stdout=log,stderr=subprocess.STDOUT)
 (out/'exit.json').write_text(json.dumps({'exit':result.returncode})+'\n')
 assert result.returncode==(1 if a.phase=='baseline' else 0),result.returncode
 report=json.loads((out/'tests.json').read_text());expected=(32,2,38)if a.phase=='baseline' else(34,0,38)
 actual=(report['numPassedTests'],report['numFailedTests'],report['numPendingTests']);assert actual==expected,(actual,expected)
 raw=r/'packages/web-renderer/src/test/__screenshots__/3d-grid-diagnostic';current=raw/a.phase;hashes={str(f.relative_to(current)):sha(f.read_bytes())for f in current.rglob('*.png')};assert len(hashes)==16,hashes
 (out/'original-png-sha256.json').write_text(json.dumps(hashes,indent=2)+'\n')
 old=[('505ef73204ce660f6ced96ffa2aad828eb13616a4f97f1a6d59c864dfc6e18df','3b9d88fa86364d3abf48c3ca3fa0c4ca082493a6eb34bcaa8d76560b71ca6c6e'),('8afbb12c97ab63f25d5c8b0a29b9698b6833861659445ca5d3de0e1efe33cea0','096dc0e8a8a7ac41b366b2185887c374421c6b412e4d4b0d9494e08b1a8d4e49')]
 for frame in [0,1]:
  key=f'firefox/frame-{frame}/enabled-true/';sampling=json.loads((current/(key+'sampling.json')).read_text());records=sampling['records'];assert sampling['devicePixelRatio']==1
  assert any(z['min']==z['mag']==(9729 if a.phase=='baseline' else 9728)and z['copies']for z in records),sampling
  assert hashes[key+'reference.png']==old[frame][0]
  if a.phase=='baseline':
   assert hashes[key+'actual.png']==old[frame][1]
   comparisons=[json.loads(f.read_text())for f in (r/'packages/web-renderer/src/test/__screenshots__/native-pixel-failures').rglob('comparison.json')]
   assert any(c.get('browser')=='firefox' and c.get('referenceSha256')==old[frame][0] and c.get('actualSha256')==old[frame][1] and c.get('mismatchedPixels')==400 and c.get('maxChannelDelta')==60 for c in comparisons)
 if a.phase=='candidate':
  baseline=json.loads((out.parent/'baseline/original-png-sha256.json').read_text())
  for key,value in hashes.items():
   if key.endswith('reference.png')or'/enabled-false/'in key:assert value==baseline[key],key
 (out/'gate.json').write_text(json.dumps({'phase':a.phase,'counts':actual,'baseline400HashGate':a.phase=='baseline','candidateStatus':'requires independent downloaded original RGBA decode'if a.phase=='candidate'else'baseline observer reproduces old encoded bytes'},indent=2)+'\n')
finally:
 test.write_bytes(test_original)
 if helper.exists():helper.unlink()
 for path,data in sources.items():path.write_bytes(data)
 assert subprocess.run(['git','diff','--exit-code','HEAD','--','packages/web-renderer/src'],stdout=subprocess.PIPE).returncode==0
