# ERP integration and queued bulk operations

TraceForge's ERP API extends the existing product registration, physical receipt
and reasoned removal operations. Businesses sign up independently using the
existing dashboard. Their ERP continues handling inventory, checkout, payment
and receipts; its connector submits completed business events to TraceForge.
Existing TraceForge short codes, full Tracking IDs and QR tracking URLs work
without changing product labels or deploying a new contract.

## Connect a business

The existing business login returns a short-lived operator bearer token.
Use that session to manage dedicated integration keys:

| Method and path | Purpose |
| --- | --- |
| `POST /operator/v1/integration-keys` | Create a key; the response shows its secret once |
| `GET /operator/v1/integration-keys` | List key names, prefixes, scopes, expiry and revocation |
| `POST /operator/v1/integration-keys/:keyId/revoke` | Revoke a key owned by this business |

Creation body:

```json
{
  "name": "Shop checkout connector",
  "scopes": ["products:read", "products:receive", "products:remove", "jobs:read"],
  "expiresInDays": 90
}
```

Save the returned `secret` in the ERP server's secret storage. Integration
requests use `Authorization: Bearer <secret>` against `/integration/v1`.
Keys are SHA-256 hashed at rest, expire after 1–365 days (default 365), and are
limited to 20 active keys per business. A key belongs to its issuing account and
business; inactive accounts/businesses, expiry and revocation block new work.
These credentials do not authenticate dashboard or generic contract endpoints.
No platform-admin approval, producer invitation or receiving role is required.
To rotate, create a replacement, update the connector, then revoke the old key.

Available scopes are `products:read`, `products:create`, `products:receive`,
`products:remove` and `jobs:read`. A producer connector typically needs create,
read and job-status access. A shop connector needs receive/remove, read and
job-status access. Job submission requires `jobs:read` and the scope for every
action in the request. Keys cannot grant extra contract permissions or override
ownership.

## Scan and map ERP stock

| Method and path | Purpose |
| --- | --- |
| `GET /integration/v1/me` | Check the key's business and scopes |
| `GET /integration/v1/scan?code=...` | Resolve an existing TraceForge code or QR URL; read-only |
| `GET /integration/v1/products?after=...&limit=...` | This business's cross-producer inventory |
| `GET /integration/v1/products/search?id=...&businessCode=...` | Exact business reference lookup, including duplicate matches |
| `GET /integration/v1/products/:trackingId/routes?after=...&limit=...` | Available receipt paths and versions |

`scan` accepts a 12-character short code, a bytes32 full Tracking ID, or a
plain HTTP(S) URL ending in `/s/<code>` or `/track/<trackingId>`. URL parsing
does not fetch the URL; it extracts the existing identifier. URL credentials,
query strings and fragments are rejected. Query-encode a complete URL with
`URLSearchParams`. Public/private publication boundaries remain unchanged:
possession of a private code gives a minimal authenticated receipt preview,
not private metadata or inventory access. Searches keep their existing exact
reference matching and privacy rules. Pagination defaults to 50, maximum 100.

Store the returned Tracking ID against ERP inventory. Each batch receipt returns
`receivedRouteId`; associate that route with the actual stock received. Later
sales identify an owned `routeId`. Several receipts of the same batch can have
the same product code while remaining distinct stock paths. The connector
allocates each sale to the actual stock path; TraceForge does not guess which
receipt was sold. Split a line into several operations if it uses several routes.

## Submit completed events

`POST /integration/v1/jobs` accepts 1–100 operations and at most 1 MiB of JSON.
The authenticated business is derived from the key. Do not supply account,
organization, wallet or tenant overrides. The API stores the job/items in MySQL
before replying `202`; acceptance is not blockchain confirmation.

Example checkout request, with codes and route references from the ERP's stock
mapping substituted for the placeholders:

```json
{
  "idempotencyKey": "sale-20261007-000123",
  "reference": "RECEIPT-000123",
  "occurredAt": "2026-10-07T09:15:20.000Z",
  "operations": [
    {
      "action": "remove",
      "idempotencyKey": "sale-20261007-000123-line-01-allocation-01",
      "productCode": "<existing-batch-code>",
      "data": {
        "routeId": "<owned-bytes32-route>",
        "quantity": 2,
        "reason": "Sold",
        "confirmed": true
      }
    },
    {
      "action": "remove",
      "idempotencyKey": "sale-20261007-000123-line-02",
      "productCode": "<existing-single-code>",
      "data": { "confirmed": true }
    }
  ]
}
```

`reference` is optional, at most 120 characters. `occurredAt` is optional ISO UTC
ERP event time; blockchain events retain their own confirmation timestamps.
Receipt/removal evidence includes the ERP operation ID, reference and supplied
event time, linked by the existing on-chain evidence hash. Receipt printing or
reprinting does not itself create a sale. Submit after the ERP confirms payment
and physical handover. An abandoned or cancelled checkout creates no removal.

| Action | Data |
| --- | --- |
| `create` | `name`, business `id`, `publish`, optional `quantity` (default 1) and dynamic `fields`; no `productCode` |
| `receive` | Existing `productCode`, `confirmed: true`; batches also supply `sourceRouteId` and `quantity` |
| `remove` | Existing `productCode`, `confirmed: true`; batches also supply owned `routeId` and `quantity`; reason defaults to Sold |

Counts are positive JSON safe integers. Initial quantity greater than one is a
batch for its lifetime. Single operations use quantity one and omit route IDs.
Lost/Damaged/Spoiled/Disposed/Other require written `reasonText`; existing Unicode
limits and on-chain reason storage apply. Create follows the original metadata,
short-code, publication and permission rules. Remove cannot exceed owned stock,
increase stock or re-add already removed items. Refund/return accounting after
removal requires a separate workflow, rather than silently restoring this count.

An optional decimal-string `version` enforces the ERP's observed source/custody
version. When omitted, the worker reads the chain version at first preparation.
It persists that exact request before execution and never substitutes a new
version, quantity, source or reason during retry. Concurrent/stale or unauthorized
operations fail for review instead of silently changing their meaning.

## Status, retries and failures

`GET /integration/v1/jobs/:jobId` returns this business's job, counts and each
item's result: operation ID, tracking/short codes where applicable, transaction
hash and block number. It omits credentials, request bodies and signed
transactions. Use a key with `jobs:read`.

Job states are `QUEUED`, `PROCESSING`, `COMPLETED`, `PARTIAL_FAILURE`, `FAILED`
or `CANCELLED`. Item states are `QUEUED`, `PROCESSING`, `RETRY`, `CONFIRMED`,
`FAILED` or `CANCELLED`. Only CONFIRMED means the contract receipt was verified.
Each item is a separate transaction; successful lines remain successful if
another line fails. The API does not promise atomic rollback of a checkout.

Use one stable request key per ERP event and one stable item key per sale line/
stock allocation. Keys contain 8–64 ASCII letters/digits, underscores or hyphens.
Retry the identical payload/key after a lost HTTP response. A changed payload
with an existing key returns `409 request_conflict`. Reusing the identical item
in another job links to its original operation, even after it confirmed.
This prevents double removal on receipt reprints, duplicate delivery or retry.

Transient chain/DB availability, disabled broadcasting and business-lock contention
retry with bounded exponential backoff up to 256 seconds. Pending transactions
are recovered using the same write journal and signed transaction. Permanent
invalid/unauthorized operations remain FAILED: inspect the error, correct the
allocation/version and submit a new item key. Do not replay confirmed items as
new sales. Revocation cancels unstarted work; already prepared/submitted chain
writes are recovered because revocation cannot undo a transaction.

The queue admits at most 1,000 pending items per business. `429 queue_full` or
`business_busy` means retain the request in the ERP and retry later. The global
API limit is 120 requests/minute per client IP; respect `Retry-After` on rate
limits. Split larger events into stable bounded requests. Unknown fields,
malformed quantities, duplicate item keys within a request and missing
confirmations are rejected before enqueue. Conflicting item retries roll back
the whole enqueue; stock-level failures are reported later per item.

The ERP must persist an outbound event alongside its completed sale before
attempting delivery. TraceForge's queue protects work after HTTP acceptance;
the ERP's outbound record protects work before that acceptance. Checkout does
not wait for blockchain mining. Track delivery and confirmation separately.

## Run and verify

Use the current contract/database configuration. Apply API migration
`011_erp_integration.sql` after the existing migrations, build and run API plus
the worker in separate processes:

```sh
# From api/, with Node 22
npm run api:migrate
npm run build
npm start

# A second process, from api/
npm run erp:worker

# One dispatch cycle for diagnostics
npm run erp:worker:once
```

Work is ordered per business. Different businesses can progress independently.
The worker uses a database lease, a per-business lock, frozen requests and the
existing wallet nonce lock/journal. API/worker restarts preserve accepted jobs;
expired leases allow another worker to recover without duplicating writes.
Continuous indexer/publication refresh remains necessary for read projections.
Queue persistence survives shutdown, but the worker must run to process it.
For Linux supervision, install the provided
[`traceforge-erp-worker.service`](../ops/systemd/traceforge-erp-worker.service)
alongside the API/indexer services, after configuring `/etc/traceforge/api.env`.
Its broadcast setting defaults to false; explicitly enable it for an authorized
writing deployment. Hosted deployment still needs installation/reboot checks
and HTTPS. Store the ERP secret on its backend. Local operation remains on
port 3000.

```sh
npm run test:erp-input
npm run verify:operator-dashboard
npm run verify:product-input
# With the disposable Hardhat/MySQL setup from the API README:
TRACEFORGE_TEST_UI=true npm run test:direct-claim
```

The integration suite uses real HTTP, temporary MySQL, a disposable chain and
separate worker processes. It verifies multi-product checkout, private scans,
organization/scope isolation, expiry/revocation, partial failure, duplicate
delivery, concurrent workers, restart/expired-lease recovery, mined-transaction
recovery, frozen retries, disabled broadcasting and backlog backpressure.
Live activation evidence is recorded separately in
[erp-integration-evidence.json](erp-integration-evidence.json).

## Verified local activation — 2026-10-07

API 0.18.0, migration 011 and the continuous ERP worker are active against the
existing Pi contract. The database backup restored all 36 original tables with
matching row counts before migration; it now contains 40 tables. The contract
and original six demo products remain intact.

The assembled backend/desktop/mobile regression passed 147 confirmed operations,
39 accounting checkpoints and five projection rebuilds. Final backend acceptance
also passed the transport-outage recovery case, with 17 confirmed ERP operations,
four expected per-item failures and one expected cancellation. UTC job times and
key expiry stay consistent when the API restarts in a different server timezone.

The live demonstration performed nine confirmed writes: three registrations,
three shop receipts and one checkout containing three removals. Repeating the
checkout returned the same job/operations. Chain receipts, six receipt/removal
evidence hashes, metadata hashes and SQL stock balances match. The live journal
has 40 confirmed writes, no pending writes and no retained signed transactions.
Desktop/mobile browsers display the resulting details and status correctly.

| Product | Global available | Demo shop available | Trace |
| --- | --- | --- | --- |
| ERP demo Cola batch | 98 / 100 | 18 | [pfv4c5dgvjxr](http://127.0.0.1:3101/s/pfv4c5dgvjxr) |
| ERP demo Soap batch | 47 / 50 | 7 | [b47mjcjqnq85](http://127.0.0.1:3101/s/b47mjcjqnq85) |
| ERP demo Bottle | 0 / 1 | 0 | [msxjg3x9jkye](http://127.0.0.1:3101/s/msxjg3x9jkye) |

Local API documentation is at `http://127.0.0.1:3000/docs`. Run
`npm run verify:live-erp` from `api/` to recheck the saved live receipt set.
The receipt report is
[`erp-demo.json`](https://github.com/aididalam/traceforge-contracts/blob/main/deployments/9009/operations/erp-demo.json).
Demo integration secrets are stored only in the owner-only local file
`~/.traceforge/secrets/erp-demo-keys.json`; they are absent from these artifacts.
