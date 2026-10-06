# Batch upgrade — Phase 6 Pi activation

Completed locally on 2026-10-06. All six batch-upgrade phases are implemented,
tested and activated. The API and Next.js UI now use the quantity contract on
Pi, a fresh deployment-specific MySQL database and newly registered business
wallets. The [machine-readable evidence](batch-activation-phase6-evidence.json)
and [live operation receipt](../contracts/deployments/9009/operations/batch-demo.json)
record the result without passwords, private keys or signed transactions.

## Active deployment

| Field | Value |
| --- | --- |
| Chain ID | 9009 |
| Contract | `0xf286a8f7bbbe4e5f2337e1701524368794de5672` |
| Deployment block | 27861 |
| Deployment transaction | `0x7e46386d0b90dd147b1745638bd42a7a2a13f6d82103f4173bf0a3399ff108c9` |
| Runtime hash | `0x8b81a848236820215ceca237aa5cd419b858733688db3814e077199087c9b0e8` |
| Runtime size / deployment gas | 19,135 bytes / 4,211,381 |
| Database | `traceforge_batch_20261006` |
| Local API / UI | `http://127.0.0.1:3000` / `http://127.0.0.1:3101` |

The deployed runtime exactly matches the tested artifact. Owner/pending-owner
checks pass, and all four existing Besu validators remain healthy. Validator
containers and mounted ledger data were preserved. The retired contract remains
immutable historical ledger data; current manifests, raw event scope and
services point exclusively to the new contract.

## Migration and cleanup

Before changing services, the old database, configuration, deployment records,
compiled service builds and business credentials were captured in an owner-only
private snapshot under `~/.traceforge/backups/phase6-*`. The old SQL backup was
restored into a temporary verification database: all 31 tables matched their
row counts, with zero mismatches. The temporary database was then dropped.

The new database received indexer migrations 001–006 and API migrations
001–010. Network/runtime manifests and semantic labels were updated. Four
independent businesses registered on the new contract and received DB-only
codes A, B, C and D; the fourth uses the descriptive type Cold storage service.
No receiver joined the producer's workspace or required sender approval.
Legacy registration metadata was preserved in the snapshot rather than
rewritten to invent missing IDs/counts.

After live operations and normal-port browser checks passed, the new database
was also backed up and restored: all 36 tables matched, with zero row-count
mismatches. Only then was the retired `traceforge` database dropped, along with
its three active wallet files and old demo-login file. The verified private
snapshot, deployer key, four new wallets and new credentials remain outside Git.
The obsolete direct-claim seed script/active receipt were removed; Git history
retains the historical receipt.

These are clean development seeds. Restoring the historical snapshot would
restore the old contract's state, not the new contract's balances. Its SQL,
old manifest, service builds, credentials and configuration must be restored
together in a separate database with the old projection process stopped.

## Actual business operations

31 journaled transactions confirmed successfully: eight business/workspace
setup operations and 23 product operations, including six registrations.
23 accounting checkpoints compare chain and database state. There are no
pending, failed, broken or duplicate operation rows and no retained serialized
transactions. The deployment transaction is separate from these 31 writes.

The million-item batch was split between two distributors. The shop received
from both, the producer received a return, and the shop received another
portion from Distributor A. These handovers created seven routes, six with
stock remaining, with three distinct shop receipts.

| Current holder | Available |
| --- | ---: |
| TraceForge Demo Producer | 50,000 |
| TraceForge Demo Distributor | 249,500 |
| TraceForge Demo Distributor B | 250,000 |
| TraceForge Demo Shop | 349,800 |
| **Total** | **899,300 out of 1,000,000** |

Three removal operations record 100,000 Sold, 200 Lost and 500 Spoiled. The
100,000-item removal creates one action. The Lost explanation contains Bangla
text, which was decoded from the actual transaction receipt and compared with
MySQL and the displayed history. Original ID, initial quantity, metadata hash
and short code stay unchanged across transfers/removals.

Additional seeds exercise duplicate external IDs, an untouched single item,
a single removed as Damaged, a ten-item batch with one item remaining before
final removal, and private registration/publication boundaries. The final
batch reaches zero through Sold, Lost and Disposed; its status is Out of supply
chain. Sold is a removal reason, not a global status.

Invalid non-owner removal, overdraw, stale receipt, self-receipt and exhausted
batch receipt were rejected by contract simulation without broadcasting failed
live transactions. Incremental replay and a complete five-table projection
rebuild produced identical state. New raw logs belong only to this deployment.

## Try the active products

| Product | Short code | Full Tracking ID |
| --- | --- | --- |
| Million-item batch | `e382nq6drb4d` | `0x997dc9c48380d19a8d0f583452286557dd72f0ad084ad7dda1e70f0312039449` |
| Single item ready to receive | `0jx8h77sec5n` | `0x7c3de209da73eb0f6b8cc52cbfd420dce3a309e5b162492e3d25eee5a866c9c7` |

Open the [batch](http://127.0.0.1:3101/s/e382nq6drb4d) or
[single item](http://127.0.0.1:3101/s/0jx8h77sec5n).
At [business sign-in](http://127.0.0.1:3101/operator/sign-in), use
`distributor@traceforge.test` with its password from the owner-only local file
`~/.traceforge/secrets/batch-demo-accounts.json`. The existing producer,
distributor and shop demo passwords were preserved during reseeding. Passwords
are never included in committed receipts.

To experience receipt, choose Receive a product, enter `0jx8h77sec5n`, confirm
physical receipt and submit. The single is currently held by the producer.
For the batch, select an available receipt from another business and enter the
quantity physically received. Public scans and source selection are read-only;
only the explicit business confirmation records a transfer.

The live verification scripts compare the unchanged seed with this receipt.
Manual transfers/removals change the expected stock, so subsequent strict seed
verification must account for those deliberate changes.

## Verification and restart

Read-only checks against the normal local ports pass for desktop and mobile:
public metadata/counts, all four consented holder names, source selection,
on-chain reasons, single statuses, private lookup, actual distributor sign-in,
HttpOnly session cookie, owned stock and receipt preview. There were zero
product writes, page errors, accessibility violations in the checked views or
horizontal overflow. Screenshots are under `/private/tmp/traceforge-phase6-ui/`.
Final monitoring reported zero event lag and block lag two within the configured
limit of 30. The continuous projection/publication loop remains running.

With Node 22 and the private local configuration available:

```sh
# Read-only live checks, from api/
npm run verify:live-batch
npm run verify:write-journal-readiness

# Read-only desktop/mobile checks, from ui/; requires Chromium
npm run verify:live-batch

# Chain/projection monitoring, from indexer/
npm run monitor:prod
```

After a restart, keep the Pi RPC tunnel open with `ssh -N pi`. When issuing
other SSH commands while that tunnel exists, use
`ssh -o ClearAllForwardings=yes pi` to avoid duplicate forwarding. Start the
following in separate terminals after building API, indexer and UI:

```sh
# API, from api/
npm start

# UI, from ui/
TRACEFORGE_PUBLIC_API_ORIGIN=http://127.0.0.1:3000 \
TRACEFORGE_OPERATOR_API_ORIGIN=http://127.0.0.1:3000 \
TRACEFORGE_OPERATOR_SITE_ORIGIN=http://127.0.0.1:3101 \
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101

# Continuous projection/public snapshot refresh, from repository root
node ops/sync-local.mjs
```

The API and indexer must share the new database/contract scope. Active business
wallets are under `~/.traceforge/secrets/businesses-batch-20261006`. All secret
files are owner-only. The previous Phase 5 contract/application test evidence
remains valid; this phase adds real Pi activation checks and verified cleanup.

These local terminal processes are not reboot-persistent services. HTTPS
hosting, supervised restart, account recovery/MFA, shared sessions, load/fault
evaluation and independent validator hosts remain on the
[platform roadmap](roadmap.md). Completion of this six-phase upgrade does not
claim completion of those separate platform tasks.
