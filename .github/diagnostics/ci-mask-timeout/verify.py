from pathlib import Path
import hashlib,json,sys
p=Path(sys.argv[1]);m=json.loads((p/'capsule-hashes.json').read_text())
for rel,h in m.items():assert hashlib.sha256((p/rel).read_bytes()).hexdigest()==h,rel
print('Capsule hashes match')
