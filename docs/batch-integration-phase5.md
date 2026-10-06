# Batch upgrade — Phase 5 assembled acceptance

Verified 2026-10-06. This phase joins the Phase 2 contract, Phase 3 indexer/API
and Phase 4 Next.js UI on a disposable Hardhat chain and MySQL database.
Evidence is recorded in [batch-integration-phase5-evidence.json](batch-integration-phase5-evidence.json).
The running Pi deployment remains on the earlier whole-product flow until
Phase 6 activation.

Validation passed: 107 contract tests; API/indexer/UI typechecks and isolated
production builds; 43 UI unit tests; 104 fixture browser regressions; and both
unmocked desktop/mobile scenarios. The assembled test confirms 131 journaled
transactions, including business setup and pagination preparation, with one
expected competing-transaction failure. It records 39 accounting checkpoints.
API security/input/provenance gates, ABI consistency, operational checks and
all four production dependency audits pass. The runtime is 19,135 bytes,
within the 24,576-byte contract size limit. Hosted CI is configured to run these
checks; this evidence records the local run, not a hosted CI result.

## Actual browser operations

The acceptance suite uses real Chromium desktop and mobile contexts. Browser
requests pass through Next's actual public/operator gateways to the test API;
there are no intercepted routes or mocked responses. Three independent
businesses sign in through the UI with synthetic credentials. Tests verify the
HttpOnly session cookie, empty browser local storage and absent authorization
headers on browser writes.

Each profile creates a single with the default quantity of one, receives it at
another business and removes it as Damaged with a written explanation. It
also creates a million-item batch and another registration with the same
business reference. Full Tracking IDs and short codes differ. The browser
selects the intended product, chooses the exact source receipt and confirms
physical receipt. Generated QR pixels decode to the actual issued short URL.

| Operation | Producer | Distributor | Shop | Globally available |
| --- | ---: | ---: | ---: | ---: |
| Register | 1,000,000 | 0 | 0 | 1,000,000 |
| Distributor receives 600,000 | 400,000 | 600,000 | 0 | 1,000,000 |
| Shop receives producer's remaining 400,000 | 0 | 600,000 | 400,000 | 1,000,000 |
| Shop receives another 250,000 from distributor | 0 | 350,000 | 650,000 | 1,000,000 |
| Return 50,000 to producer | 50,000 | 350,000 | 600,000 | 1,000,000 |
| Distributor receives 100,000 from shop | 50,000 | 450,000 | 500,000 | 1,000,000 |
| Shop removes 100,000 Sold and 200 Lost; distributor removes 500 Spoiled | 50,000 | 449,500 | 399,800 | 899,300 |

Separate receipts at the same business remain distinguishable. Operator pages
show own stock separately from global stock, and public tracking groups
consented business names without losing receipt provenance. One bulk sold
removal creates one record. Lost/Spoiled explanations survive on-chain logs,
SQL projection and rendered history, including Bengali text. Own-source and
overdraw controls prevent an invalid UI submission.

The scenario then removes each remaining route, leaving one item on the
producer's return receipt. It remains a batch In supply chain. Removing the
last item makes the whole registration Out of supply chain and disables receipt
and removal. Original ID, initial quantity, root route and registration metadata
hash remain unchanged at every checkpoint.

## Accounting, pagination and privacy

Every browser mutation is followed by real backfill, projection and publication
sync. Checkpoints compare SQL product/route state with contract reads, verify
registration JSON bytes against their on-chain hash, and assert product and
route conservation. Removal quantities and reason totals match contract
state and the API summary. Actual SQL movement records carry the written reason.

The disposable database allocates canonical event IDs starting at
`9007199254741000`, above JavaScript's exact integer range. These are database
row cursors, not simulated large chain heights or route versions. A separate
70-item batch receives 55 real removals. Both public and operator browsers load
its 56 logical updates in two pages, without duplication or precision loss.
Global remaining quantity stays 15 independently of the loaded history page.

After each browser profile, incremental projection and a full rebuild produce
the same rows in product quantities, batch routes, quantity movements, single
custody receipts and entities. The accompanying backend suite also checks
competing stale receipts, non-owner/overdraw rejection, normalized idempotent
retries and conflicts, invalid receipt payloads, atomic rollback of inconsistent
events, deployment isolation, business-code boundaries and reservation races.

Public lookup remains publication-gated. A private short code exposes only the
minimal authenticated receipt preview, without its name or metadata. Public
search, holders and receipt inspection issue only GET requests and omit cookies
and authorization, even when the browser has an operator cookie. Existing
regressions cover publication revocation and business-name consent changes.
Axe accessibility and horizontal-overflow checks run on the actual receipt,
removal and public tracking pages in both profiles.

## Reproduction and isolation

Install dependencies in contracts, indexer, API and UI; use Node 22 and MySQL 8.
Install Chromium with `cd ui && npx playwright install chromium`.
For a workstation already serving the default build:

```bash
cd contracts
npm run compile
npm test
npx hardhat node --network integration --hostname 127.0.0.1 --port 18545
```

In another terminal, starting at the parent repository:

```bash
cd indexer
./node_modules/.bin/tsc --outDir dist-phase5
cd ../api
./node_modules/.bin/tsc --outDir dist-phase5
cd ../ui
TRACEFORGE_UI_DIST_DIR=.next-phase5 NEXT_TELEMETRY_DISABLED=1 npm run build
cd ../api
TRACEFORGE_TEST_API_DIST=dist-phase5 \
TRACEFORGE_TEST_INDEXER_DIST=dist-phase5 \
TRACEFORGE_UI_DIST_DIR=.next-phase5 TRACEFORGE_TEST_UI=true \
npm run test:direct-claim
```

The API harness uses its MySQL connection settings to create/drop only a random
`traceforge_test_claim_*` database. It checks chain 9009 at loopback port 18545,
deploys a fresh test contract and owns API 13301/UI 13478. A test-only loopback
control server performs comparisons and rebuilds using an ephemeral secret.
No test control route or rate-limit bypass is added to the production API.
Browser pacing/retries respect the real API limits. The runner deletes its
synthetic wallets and manifest and stops its API/UI children on completion or
failure. Stop the separately started Hardhat node afterward.

`ui/tests/*.integration.ts` uses a separate Playwright configuration and
`integration-results/` output directory. It cannot run as part of the fixture
suite by accident, and concurrent suites cannot delete each other's artifacts.
The manifest has synthetic identity/product references; server tokens, signer
keys and database credentials are never passed to the browser suite.

Parent CI now runs the assembled acceptance after building all applications
and installing Chromium. Default CI outputs remain `dist` and `.next`.
Local `dist-phase5` and `.next-phase5` preserve running builds and are ignored.

## Next phase

Phase 6 deploys the tested contract on Pi, applies the matching migrations,
updates deployment/ABI/runtime configuration, activates matching services and
performs real single/batch operations. Snapshot, reseed and cleanup follow the
agreed development-data policy. Phase 5 makes no live deployment or old-data
deletion and does not complete the remaining hosting/account-recovery work.
