from pathlib import Path
import hashlib
import json
import sys

root = Path(sys.argv[1])
manifest = json.loads((root / 'capsule-sha256.json').read_text())
for name, expected in manifest.items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == expected, (name, actual, expected)
print(json.dumps({'verified': manifest}))
