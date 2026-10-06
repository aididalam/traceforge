# Product ID and batch API — phase 3

Implemented 2026-10-06. This phase connects the quantity contract to the indexer,
database and business/public APIs. UI integration followed in phase 4, and
[Phase 6](batch-activation-phase6.md) subsequently activated the new Pi contract,
fresh database and local services. The checks below describe the isolated
Phase 3 implementation milestone.

## Delivered behaviour

Registration requires a business reference `id` alongside the product name.
Optional quantity defaults to one; greater initial counts classify a batch for
its lifetime. Canonical metadata JSON preserves the original reference and
initial count; arbitrary additional fields remain available. Duplicate references
within and between businesses create independent registrations when submitted
with new request keys.

Every confirmed registration receives its full Tracking ID and reserved short
code before the projector catches up, including private products. Public lookup
still requires explicit sharing. External-ID search is exact and case sensitive,
supports an optional origin-business code, and returns paginated matching
registrations rather than treating business references as unique keys.

Batch receipt debits the selected source path and creates a child receipt path.
Different receipts into the same business and returns to the producer retain
separate ancestry, quantities, timestamps and versions. Inventory sums the
business's available stock across its paths. Public views aggregate current
holders and report global availability independently of the current page.

Only a path's current holder can remove its available quantity. Sold is the
default reason; other supported reasons require an explanation. The actual
written explanation is part of the on-chain event. A bulk removal creates one
operation, even for 100,000 items. The whole batch ends only when global
availability reaches zero; its original batch classification remains fixed.
New singles retain ordinary whole-item receipt and use versioned removal for
their single unit. The existing HTTP `/close` path dispatches to the appropriate
new or legacy contract operation.

Database-only business codes begin with one A–Z/0–9 character, then grow to two,
three and onward as combinations fill. Available custom codes are accepted at
signup. Unique reservations and transactional locks protect concurrent signup
and allocation. The optional code is shown in the account response and can be
suggested as a printed prefix in the next UI phase; it grants no permissions.

## Implementation surfaces

- Indexer migration 006 adds scoped product counts, receipt routes and quantity
  movements. Ordered updates check old balances/owners/versions and database
  constraints enforce conservation. CLI status/history and monitoring recognize
  the new model and its scoped v2 checkpoint.
- API migration 010 adds registered-reference indexes, deployment identity,
  confirmation state and business-code reservations/allocator state.
- API write handlers preserve simulation, journal-before-broadcast, signer locks,
  exact retries and mined-receipt verification for actor, product, routes,
  quantity, version, reason and evidence.
- Operator/public routes add reference search, routes, holders and quantities;
  existing product/history responses include quantity data for new registrations.
  All large counts, versions, timestamps and cursors cross JSON as strings.
- History suppresses only matching paired registration/legacy trace companions
  before pagination. Raw audit logs remain complete. Public names honor current
  business consent without limiting a dynamic chain to 32 participants.
- CI includes product-input/receipt and public-product schema checks, plus the
  expanded disposable single/batch integration harness.

See the [API README](../api/README.md), [indexer README](../indexer/README.md) and
[agreed request formats](batch-quantity-plan.md) for endpoints and examples.

## Verification

The disposable test deploys the compiled quantity contract on localhost port
18545, creates its own database and wallet directory, and starts a separate API
on port 13301. Its single/batch lifecycle confirms **36 transactions**. The
competing-receiver check permits a loser rejected before broadcast or a reverted
transaction; exactly one receiver succeeds and stock remains conserved.

The integrated scenario covers:

- independent signup, custom business types, login and cross-producer inventory;
- required ID/safe-integer validation before document storage, reserved metadata
  labels, multilingual values/reasons and idempotent/conflicting registrations;
- duplicate external IDs, origin-code filtering, stable pre-projection short
  codes, private aliases and publication-gated exact search;
- a **1,000,000-item** batch across three holders and six paths, including
  repeated receipts and a return to the producer;
- unchanged global totals during receipt, own-stock aggregation across paths,
  bounded route/holder pagination and current business-name consent;
- stale, oversized, self and competing receipts, non-holder removals and required
  explanations; bulk removal, category totals and final global exhaustion;
- single-item receipt/removal, logical dated histories and private-field omission;
- repeated projection, a full rebuild, deployment-scoped reads and atomic rollback
  after intentionally corrupting a disposable removal event;
- business-code boundary growth, custom collision/reuse, transaction rollback,
  concurrent allocation and signup failure without orphan accounts/key files;
- signed-journal cleanup, interrupted-write blocking and broadcast-disable gates.

API/indexer typechecks and isolated builds pass. Offline security, token-expiry,
operator, public discovery/presentation/tracking/short-link, product-input/receipt
and public-product checks pass. ABI consistency and root operational/monitoring
asset checks pass. The harness also exercises the actual migration runners and
the existing temporary-table dashboard/public-history integration tests against
the upgraded schema. The phase 2 contract suite remains **107 passing**; no
contract changes were needed in phase 3.

For local verification while the legacy services continue running:

```sh
# In both api/ and indexer/:
npx tsc --outDir dist-phase3

# In api/, with the disposable Hardhat integration chain running:
TRACEFORGE_TEST_API_DIST=dist-phase3 TRACEFORGE_TEST_INDEXER_DIST=dist-phase3 npm run test:direct-claim
```

The harness respects the production request limits and cleans up its own database
and wallet files. Hosted CI uses its disposable MySQL service and default `dist`.

## Activation boundary and next phase

Apply indexer migration 006 before API migration 010 when activating the upgrade.
An existing v1 read-model database requires a full projection rebuild. Legacy
typed tables still represent one deployment per database; the projector rejects
mixed-deployment raw logs and requires a separate database for each deployment.
The API migration runner automatically backfills codes for existing accounts
without changing existing/custom reservations. The idempotent
`npm run business:codes:backfill` command can repeat that step.

Phase 4 adds the required reference field, batch/quantity controls, business-code
suggestion, duplicate-result/source selection, own-stock display and reasoned
removal to the Next.js UI and gateway. Public pages will show availability,
current holders and quantity movements. UI integration and Pi deployment remain
the next authorized phases; they are not represented as delivered by this phase.
