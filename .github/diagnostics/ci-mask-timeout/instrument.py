from pathlib import Path
import argparse, hashlib, json, shutil, subprocess
parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('evidence',type=Path);parser.add_argument('--restore',action='store_true');args=parser.parse_args()
source=args.source.resolve();evidence=args.evidence.resolve();capsule=Path(__file__).resolve().parent;m=json.loads((capsule/'manifest.json').read_text());evidence.mkdir(parents=True,exist_ok=True)
state=evidence/'observer-state.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if args.restore:
 if not state.exists():raise SystemExit('Observer was never applied')
 saved=json.loads(state.read_text())
 for rel,row in saved.items():
  p=source/rel
  assert not p.exists() or sha(p) in [row['observed'],row['original']],('Unexpected observer mutation',rel)
  if row['original'] is None:p.unlink(missing_ok=True)
  else:
   shutil.copyfile(evidence/'preimages'/rel,p);assert sha(p)==row['original']
 original_hashes={rel:sha(source/rel) for rel in m['originalHashes']}
 diff=subprocess.check_output(['git','diff','--binary'],cwd=source)
 index_diff=subprocess.check_output(['git','diff','--cached','--binary','HEAD'],cwd=source)
 (evidence/'unexpected-restoration-diff.patch').write_bytes(diff)
 (evidence/'unexpected-restoration-index.patch').write_bytes(index_diff)
 tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=source,text=True).strip()
 result={'restored':original_hashes==m['originalHashes'] and not diff and not index_diff and tree==m['tree'],'paths':saved,'originalHashes':original_hashes,'trackedDiffClean':not diff,'indexMatchesHead':not index_diff,'headTree':tree}
 (evidence/'restoration.json').write_text(json.dumps(result,indent=2))
 assert result['restored'],'Restoration gate failed; unexpected diffs retained'
 raise SystemExit()
assert not state.exists(),'Cannot apply twice'
actual_head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
assert actual_head in [m['hostedMerge'],m['source']]
assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=source,text=True).strip()==m['tree']
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=source,text=True).strip()
for rel,h in m['originalHashes'].items():assert sha(source/rel)==h,rel
outputs={'packages/web-renderer/src/test/mask-image-url-sizing.test.tsx':(capsule/'observed-test.tsx').read_bytes(),'packages/web-renderer/vitest.config.ts':(capsule/'observed-config.ts').read_text().replace('__ORDER_OUTPUT__',json.dumps(str(evidence/'order.jsonl'))).encode(),'packages/web-renderer/ci-mask-order-reporter.ts':(capsule/'order-reporter.ts').read_bytes()}
assert not (source/'packages/web-renderer/ci-mask-order-reporter.ts').exists(),'Observer reporter path already exists'
saved={}
for rel,b in outputs.items():
 p=source/rel;original=sha(p) if p.exists() else None
 if original is not None:
  dest=evidence/'preimages'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
 saved[rel]={'original':original,'observed':hashlib.sha256(b).hexdigest()}
# State precedes writes so cleanup can diagnose any interrupted application.
state.write_text(json.dumps(saved,indent=2))
for rel,b in outputs.items():(source/rel).write_bytes(b)
print(json.dumps({'applied':saved,'source':actual_head,'tree':m['tree']}))
