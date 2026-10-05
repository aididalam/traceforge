# Single-ID public tracking

Prepared locally on 2026-10-05. The canonical consumer URL is:

```text
https://traceforge.example/track/<trackingId>
```

`traceforge.example` is a reserved example. The real site origin is deployment
configuration. The home page accepts a single Tracking ID, an approved-origin
trace link, or the original tenant/entity pair. Existing
`/trace/:tenantId/:entityId` links continue to work.

## Identity and visibility

An on-chain entity is identified by `(tenantId, entityId)`; its entity ID can be
reused by another tenant. A public Tracking ID is a separate, random 32-byte
hex identifier that resolves to that pair. The API registry enforces a global
primary key on the binary Tracking ID and one unique ID per tenant/entity pair.
Random collision retries preserve existing mappings; concurrent issuers reuse
the winner's ID. The uniqueness guarantee applies to this shared registry;
independent deployments need a shared registry to provide the same guarantee.

IDs are stable: repeated issuance returns the same ID, and unpublishing does
not delete or reassign it. Republishing the same pair restores the same link.
An existing, explicitly published entity is required before an ID can be issued.
Issuance itself never publishes an entity. The registry is separate from the
indexer's derived tables so a projection rebuild does not recreate IDs.
Backups must preserve this registry together with publication state.

```text
GET /public/v1/tracking/:trackingId
200 { trackingId, tenantId, entityId }
```

The resolver joins the registry, publication table and current entities on
every request. Unknown IDs, unpublished pairs and missing indexed entities
return the same 404 without disclosing the pair. Responses contain only the
three public identity fields; there are no document bodies or operator details.
Malformed IDs/queries return 400 before DB access. An unapplied migration gives
a sanitized 503. The route uses the existing shared public/operator IP limit.

The Next client first resolves the ID, then reads the existing public detail
and history endpoints. Both reads retain their own publication gate. Refresh
and page restoration resolve again, and a 404 clears the prior view. The gateway
uses fixed, token-free GET paths, strict validation, no-store, cancellation and
bounded timeouts. There is no public issuance endpoint or browser signing.

## Activation checklist

This change prepares migration **005_public_entity_tracking_ids.sql**. Applied
migration 004 and the deployed contract are unchanged. Migration 005 was tested
using connection-local MySQL temporary tables; it has **not** been applied to
the live database under the current temporary-write-only authorization.

After permanent DB changes and service activation are authorized, use the API
repository's existing migration command, deploy/restart the updated API and
run the publication/issuance commands for the intended product:

```bash
npm run api:migrate
npm run public:publish -- --tenant <tenantId> --entity <entityId>
npm run public:tracking-id -- --tenant <tenantId> --entity <entityId>
```

The last command prints the stable ID and `/track/<trackingId>` path. Keep the
record explicitly published for public access. To hide it, use the existing
`public:unpublish` command; retain its registry row. No chain transaction or
contract redeployment is needed. These commands are documented, not executed
against permanent live data in this task. The running user API must use the
updated code before the new gateway endpoint can resolve IDs.

QR generation/scanning remains Phase 2; its payload should use this canonical
single-ID URL. Operator dashboard/account workflows remain later work.

## Verification

- API build and existing offline public-discovery verifier.
- `npm run verify:public-tracking`: synthetic DB, actual issuer/route/perimeter
  and CLI validation; no DB, signer, RPC or credentials required in hosted CI.
- `npm run test:public-tracking`: opt-in local MySQL integration using temporary
  tables that drop on disconnect. Live entities/publications/write counts stay
  unchanged. Build the API first. This local test is excluded from hosted CI.
- UI typecheck, production Next build, unit and desktop/mobile browser checks
  cover single-ID lookup, real gateway requests, same Entity ID across tenants,
  invalid/unknown IDs, credential omission, revocation, accessibility and legacy
  routes. Fixtures are synthetic; they are not shipped as live product data.

The checks passed locally: 17 unit tests and 38 browser checks (desktop Chromium
and an emulated Pixel 7 Chromium profile), plus the API offline and real-MySQL
temporary-table checks. Automated axe scans are not a manual screen-reader audit.

An isolated local preview also displayed the existing indexed Batch's 16 events
through three credential-free public GET requests, with zero browser/hydration
errors. The preview uses an uncommitted publication row with rollback and a
connection-local temporary tracking registry. MySQL cannot reopen a temporary
publication table in the history query's multiple joins. Disconnect rolls back
the preview publication and drops its registry. A separate DB connection
confirmed zero committed publications, no live registry table and migration 005
unapplied. The preview ID is temporary and is not a permanent product ID.

The UI GitHub remote and all new commits remain unpublished under the existing
no-create/no-push instruction.
