#!/usr/bin/env python3
"""Keep API and indexer consumers on the exact compiled contract ABI."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Check committed consumers without rewriting them.')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
abi = json.loads((root / 'contracts/artifacts/contracts/TraceForge.sol/TraceForge.json').read_text())['abi']
outputs = {root / 'indexer/abi/TraceForge.abi.json': json.dumps(abi, indent=2) + '\n'}
for kind in ('read', 'write'):
    outputs[root / f'api/src/traceforge-{kind}-abi.ts'] = (
        '// Generated from the compiled TraceForge ABI. Refresh with ops/refresh-contract-abi.py.\n'
        + f'export const traceForge{kind.capitalize()}Abi = ' + json.dumps(abi, indent=2) + ' as const;\n')

if args.check:
    mismatches = [str(path.relative_to(root)) for path, value in outputs.items()
                  if not path.exists() or path.read_text() != value]
    if mismatches:
        raise SystemExit('ABI consumers differ from the compiled contract: ' + ', '.join(mismatches))
    print('API/indexer ABI consumers match the compiled contract.')
else:
    for path, value in outputs.items():
        path.write_text(value)
