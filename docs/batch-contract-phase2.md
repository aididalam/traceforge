# Batch contract implementation — phase 2

Completed 2026-10-06 in source and isolated tests. This milestone records contract
implementation; the matching consumers and live Pi deployment were subsequently
completed in [Phase 6 activation](batch-activation-phase6.md).

## Resulting behaviour

`createProduct` records initial quantity, original metadata hash and originating
business. A count of one retains ordinary single-item custody; larger counts
create a batch root route. Original identity and count survive metadata edits.
The API will validate required external `id` and default omitted quantity to one
in phase 3; the contract receives an explicit integer count.

`claimBatch` debits a selected source route and creates a child for the active
receiver, without a sender proposal or producer-workspace membership. The source
version rejects stale claims/removals. Full handover leaves a historical empty
source. Separate routes into the same business and returns preserve ancestry.
Transfers conserve global available quantity.

`removeProduct` debits only the caller's own route, decreases global availability
and emits quantity, actual written reason, organization, actor, time, version and
evidence. Reason totals are readable directly. Sold is enum value zero and allows
an empty explanation; Lost/Damaged/Spoiled/Disposed/Other require text. The UTF-8
validator rejects malformed byte sequences, unsafe controls, whitespace-only
explanations and text above 256 code points/1,024 bytes.

The product closes only when all available quantity is exhausted. Removing all
of a shop's share does not close another holder's share. Bulk removal creates
one action/event, independent of the number of items removed.

New single registrations retain `claimCustody`, use quantity one and a zero route
ID for `removeProduct`, and require the expected custody version. Legacy generic
`createEntity`/claim/close still work. `closeEntity` rejects new registered singles
so closure cannot omit quantity/reason accounting; the existing HTTP `/close`
compatibility path will dispatch to reasoned removal in phase 3. Batch whole-item
claim, close, custody-version reads and source-custodian links reject the wrong
ownership model.

## Interface and integration

Read methods are `getProduct`, `getBatchRoute`, `getRemovalTotal` and
`computeRootRouteId`. Registration, receipt and removal events are
`ProductRegistered`, `BatchReceived` and `QuantityRemoved`. Their balances,
versions, owners and parent/source IDs allow independent replay without scanning
one row per individual item. The component
[contract README](../contracts/README.md) documents argument order and reason codes.

Generated API read/write ABIs and the indexer ABI match the compiled artifact.
`python3 ops/refresh-contract-abi.py --check` detects mismatches without writing
files. CI checks ABI consistency and runtime size after compilation.

## Validation evidence

- Full contract suite: **107 passing** — 82 existing regressions and 25 new
  registration, quantity, route, reason and termination checks.
- Counts tested at one million and the exact API-safe maximum of
  **9,007,199,254,740,991**, including transfers/removals without rounding.
- Source/global conservation, distinct routes, returns, a one-item batch share,
  overdraw, non-owner removal, disabled actors/tenant, stale competing debits and
  final exhaustion verified.
- Event replay reconstructs ancestry, balances, versions and reason totals;
  multilingual reasons and invalid UTF-8 sent through raw calldata verified.
- A 100,000-item removal emits one action and uses less than 500,000 gas.
- Compiled runtime: **19,135 bytes**; limit 24,576; headroom 5,441 bytes.
- API and indexer typechecks/production builds passed with refreshed ABIs.
- Existing isolated API/indexer integration passed with **14 confirmed writes**
  using the new compiled contract, a disposable DB/wallet directory and Hardhat
  on loopback port 18545. It exercised the legacy whole-product signup/create/
  claim/close workflow, retry/receipt verification, privacy and repeated projection.
  This is compatibility evidence, not a claim that batch HTTP workflows exist.
- API security, operator offline, provenance-schema and root operational/CI
  asset checks passed. ABI check success and mismatch detection were exercised.

The disposable test chain was stopped and its DB/wallet resources cleaned up.
Pi's contract, validator ledger and the live product database were not migrated
in this phase. Continue with [phase 3 in the quantity plan](batch-quantity-plan.md).
