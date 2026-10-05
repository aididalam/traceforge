#!/usr/bin/env python3
"""Keep API and indexer consumers on the exact compiled contract ABI."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
abi = json.loads((root / 'contracts/artifacts/contracts/TraceForge.sol/TraceForge.json').read_text())['abi']
(root / 'indexer/abi/TraceForge.abi.json').write_text(json.dumps(abi, indent=2) + '\n')
for kind in ('read', 'write'):
    (root / f'api/src/traceforge-{kind}-abi.ts').write_text(
        '// Generated from the compiled TraceForge ABI. Refresh with ops/refresh-contract-abi.py.\n'
        + f'export const traceForge{kind.capitalize()}Abi = ' + json.dumps(abi, indent=2) + ' as const;\n')
