"""Retain partial observations without turning a diagnostic into a CI fix."""
from pathlib import Path
import json
import re
import sys

root = Path(sys.argv[1])
events = []
source = root / 'mdx-timing.jsonl'
if source.exists():
    events = [json.loads(line) for line in source.read_text().splitlines() if line]
counts = {name: sum(row['event'] == name for row in events) for name in
          ['require-start', 'require-end', 'evaluate-start', 'evaluate-end', 'render-end']}
pages = {}
for row in events:
    if row.get('page'):
        pages.setdefault(row['page'], []).append(row['event'])
log = (root / 'tests.log').read_text(errors='replace') if (root / 'tests.log').exists() else ''
log = re.sub(r'\x1b\[[0-9;]*m', '', log)
docs = [line for line in log.splitlines() if '@remotion/docs:test:' in line]
report = {
    'expectedDocsTests': 93,
    'expectedMdxPages': 45,
    'eventCounts': counts,
    'distinctPages': len(pages),
    'all45PagesCompleted': len(pages) == 45 and all(
        phases == ['evaluate-start', 'evaluate-end', 'render-end'] for phases in pages.values()),
    'docsExecutionSummaryLines': [line for line in docs if re.search(
        r'\b(?:pass|fail|tests across|cache hit|cache miss)\b', line)],
    'restoration': json.loads((root / 'restoration.json').read_text())
        if (root / 'restoration.json').exists() else None,
    'qualification': 'Observational only. Review actual task execution and all 93 docs results in tests.log. '
        'Partial records or a timeout remain failures; passing does not explain the original failure. '
        'Synchronous observer I/O adds wall time under the unchanged five-second deadline; '
        'reported require/evaluate/render durations exclude preceding start-record writes.',
}
(root / 'observation-summary.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
