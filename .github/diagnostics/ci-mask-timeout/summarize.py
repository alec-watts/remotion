from pathlib import Path
import base64,json,re,sys
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);rows=[];errors=[]
p=out/'order.jsonl'
if p.exists():
 for line in p.read_text().splitlines():
  try:rows.append(json.loads(line))
  except Exception as e:errors.append(str(e))
observations={engine:{'stages':[],'originals':[],'afterEach':[]} for engine in ['chromium','firefox','webkit']}
for row in rows:
 if row['event']!='browser:observation':continue
 for prefix,key in [('MASK_TIMEOUT_STAGE:','stages'),('MASK_TIMEOUT_ORIGINAL:','originals'),('MASK_TIMEOUT_AFTER_EACH:','afterEach')]:
  for match in re.finditer(prefix+r'(\{[^\n]*\})',row['content']):
   try:
    value=json.loads(match.group(1));engine=value['project'];assert engine in observations
    if key=='originals':
     blob=base64.b64decode(value.pop('base64'),validate=True);assert blob.startswith(b'\x89PNG\r\n\x1a\n');dest=out/'originals'/engine;dest.mkdir(parents=True,exist_ok=True);file=dest/(value['id']+'.png');assert not file.exists();file.write_bytes(blob)
    observations[engine][key].append(value)
   except Exception as e:errors.append(str(e))
expected={'chromium':(42,6),'webkit':(42,6),'firefox':(36,4)}
for engine,value in observations.items():
 stages=value['stages'];value['complete']=len(stages)==expected[engine][0] and len(value['originals'])==expected[engine][1] and len(value['afterEach'])==1 and stages[-1]['stage']=='test:complete' and [s['sequence'] for s in stages]==list(range(len(stages)))
run_ends=[r for r in rows if r['event']=='run:end']
cases=[c for r in run_ends for module in r['modules'] for c in module['cases']]
workload_complete=len(run_ends)==1 and len(run_ends[0]['modules'])==306 and len(cases)==1671 and sum(c['state']=='skipped' for c in cases)==193
summary={'originalWorkloadComplete':workload_complete,'runEnds':run_ends,'observerErrors':errors,'events':len(rows),'executedStartEvents':sum(r['event']=='test:start' for r in rows),'observations':observations,'restoration':json.loads((out/'restoration.json').read_text()) if (out/'restoration.json').exists() else None,'upstreamTimeoutCause':'unproven','matchedCacheAndPriorLoad':'must compare actual run logs; not guaranteed by command equivalence','incompleteTimeoutIsRetainedNotFilled':True}
(out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k not in ['observations','restoration']}))
# A missing observation gate fails this step while preserving the original command conclusion/log.
if errors or not all(v['complete'] for v in observations.values()) or (not summary['restoration'] or summary['restoration'].get('restored') is not True) or not workload_complete:sys.exit(1)
