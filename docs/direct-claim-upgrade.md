# Direct-claim upgrade and local activation

Completed locally on 2026-10-05. Businesses independently register, receive any
open product after physical handover and close products they currently hold.
Sender proposal/accept/cancel and pending custody have been removed throughout
the contract, ABI, API, indexer and UI. Production workspace roles remain for
creating/editing/linking products.

## Fresh ledger and database

The four TraceForge Besu containers on Pi were stopped and removed. Their mounted
`/home/aidid/traceforge-chain/runtime` directory was deleted, then rebuilt from
the generated genesis and validator keys before starting four fresh validators.
The keys/genesis were preserved; the old ledger was not. The contract address
returned empty bytecode before the new deployment. Unrelated Docker resources
were left intact.

Only the local `traceforge` database was recreated. Indexer migrations 001–005
and API migrations 001–009 were applied, with the new deployment scope and
semantics. Old products, tokens, pending custody and operation journals were
removed. Required deployment credentials were preserved outside Git.

| Deployment field | New value |
| --- | --- |
| Chain ID | 9009 |
| Contract | `0x07bf849fb7e97fa174791bdf3bf9bffa621e145b` |
| Deployment block | 71 |
| Transaction | `0xa7a2663b48d970d9c8be7fc062b8887403a9811a61e298dee9fcd634b88f6ca6` |
| Runtime hash | `0xaf14115fa014b0868ffa446729a398f5a2aeb5d9fbdc9b41551f8e33d746e439` |

The address matches the retired deployment because a fresh chain reused the
same deployer at nonce zero. Its bytecode and deployment transaction are new.
Old deployment/bootstrap fixtures and obsolete sandbox verifiers were removed;
Git history retains the previous version.

## Real operations and acceptance

Three independent businesses registered without invitations. Twelve confirmed
business operations exercised Producer → Distributor → Shop → Sold/Close and
left a second product open with the Distributor. Neither receiver needed
membership in the producer workspace. Non-holder close, closed-product receipt
and stale-version receipt were rejected by contract simulation. No pending or
failed operation remains; confirmed journals retain no signed transaction data.

| Product | Full Tracking ID | Short ID |
| --- | --- | --- |
| Open, held by Distributor | `0xba95c26d64f658f7a5ca1c8c338db3df99df59390547cecef4cba7cbb04c92a0` | `1pq7t0pf6dej` |
| Sold/closed, last held by Shop | `0xe4a34132712d4b287a95c5124426f2721ca9828f59e1b1f7f4be32fb9a81f4aa` | `7xjw99x82vz1` |

Public tracking shows product details, consented business names and recorded
UTC dates. Live browser verification covered both short links, real Distributor
sign-in, cross-producer product history, QR, holder close controls and sign-out.
The public [operation receipt](../contracts/deployments/9009/operations/direct-claim-demo.json)
contains identifiers and receipt references, without passwords or keys.

82 contract tests, 28 UI unit tests and 74 desktop/mobile browser tests passed.
The disposable chain/DB integration confirmed 14 actual writes and additionally
covered generic terminal guards, uncertain-write protection, scan publication
revocation and disabled broadcasts. SQL temporary-table and security/privacy
checks passed; production dependency audits found zero vulnerabilities. Root CI runs
the disposable integration using a synthetic MySQL service and local Hardhat,
without Pi credentials or live database access.

## Local services and restart

Use Node 22. The local API is `http://127.0.0.1:3000`, UI is
`http://127.0.0.1:3101`, and Pi RPC is forwarded to loopback port 8545.
An SSH tunnel must stay open. When a tunnel is already using that port, remote
commands can use `ssh -o ClearAllForwardings=yes pi`.

Start each process in its own terminal after building API, indexer and UI:

```sh
# API, from api/
npm start

# UI, from ui/
TRACEFORGE_PUBLIC_API_ORIGIN=http://127.0.0.1:3000 \
TRACEFORGE_OPERATOR_API_ORIGIN=http://127.0.0.1:3000 \
TRACEFORGE_OPERATOR_SITE_ORIGIN=http://127.0.0.1:3101 \
npm start -- --port 3101

# Continuous projection/public snapshot refresh, from repository root
node ops/sync-local.mjs
```

The projection loop reads the private API `.env`, backfills, projects and syncs
opted-in public details every five seconds. It respects explicit unpublishing.
Managed business keys are in the configured owner-only directory outside Git.
Demo account credentials are only in the owner-only local file
`~/.traceforge/secrets/direct-claim-demo-accounts.json`.

Retired sandbox keys/tokens, the old signer map and two pre-reset SQL backups
were moved intact into an owner-only `~/.traceforge/retired/` archive. Permanent
credential/backup deletion was rejected by automatic approval review; the old
mounted chain data and live database were deleted as authorized. Archived files
are outside the active configuration and can be recovered if needed.

These terminal processes are not installed as reboot-persistent services. HTTPS
hosting, process supervision, account recovery, shared sessions and load/fault
evaluation remain on the delivery roadmap.
