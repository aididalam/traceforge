# Short product tracking links

Implemented and verified on 2026-10-05. A product can be shared as:

```text
https://traceforge.example/s/<12-character-code>
```

The hostname is a reserved example; a real HTTPS domain is a deployment choice.
The short page renders the existing product information, current holder and
dated supply history while keeping the short URL. The single Tracking ID field
accepts either this code or the existing full hex ID. `/track/<trackingId>` and
`/trace/<tenantId>/<entityId>` remain compatible. QR generation is still phase 2.

## Identity and storage

Migration `007_public_entity_short_links.sql` creates a separate mapping from
`short_code` to the global public `tracking_id` in migration 005. The code is
12 lowercase characters from `0123456789abcdefghjkmnpqrstvwxyz`; input accepts
uppercase and normalizes it. Cryptographic random bytes select 32 symbols
without bias, yielding 60 random bits. Codes identify public records; they are
not authentication credentials or a substitute for publication permissions.

The code primary key and unique Tracking ID constraint enforce one product per
code and one code per ID within this registry. Issuance retries collisions up
to eight times and reuses a concurrent issuer's winning assignment. It never
overwrites, recycles or deletes an assignment. Unpublishing hides the record
while reserving its code; republishing restores the same code. Independent
deployments need a shared registry for a shared uniqueness guarantee.

This mapping belongs in the database: it makes no blockchain transaction and
does not change the deployed contract or recorded product identity. Back up
both identity registries and publication state. A blockchain reindex cannot
reconstruct random short-code or full-ID assignments. Do not recreate these
tables when rebuilding the indexer's projections.

## API and UI behavior

```text
GET /public/v1/short-links/:shortCode
200 { shortCode, trackingId, tenantId, entityId }
```

Every lookup joins the short registry, full-ID registry, publication gate and
current indexed entity. Unknown, unpublished and orphaned records return the
same 404. Malformed codes and any query return 400 before database access.
Missing registry migrations produce a sanitized 503. Responses use `no-store`
and contain exactly four public identity fields. There is no target URL,
redirect, public issuance/mutation endpoint, document body or operator detail.
The existing shared per-IP public/operator rate limiter still applies; `/v1/*`
authentication and publication policy are preserved.

The Next gateway validates the code and strict response shape, calls a fixed
configured public API path, forwards no cookies/Authorization/incoming headers,
and rejects redirects. The browser resolves the code once, then fetches the
existing public product and history endpoints. This is three initial GETs,
the same budget as a full-ID lookup. Those reads retain their publication gates.
Refresh and restored-page reads resolve again; unavailable publication clears
the prior record. Pagination preserves decimal event cursors and the full ID.

The page displays the short code as Tracking ID and keeps the full ID inside
Reference details. Copy tracking link constructs the validated `/s/<code>`
path with the current page's origin. No arbitrary external destination is
stored or followed. The future QR link parser accepts approved HTTPS origins
and exact short/full/legacy tracking paths without credentials/query/fragment.

## Activation

Migrations **005, 006 and 007 are prepared and have not been applied live**.
Verification used connection-local temporary tables and checked unchanged
live data/schema. The running user API was not replaced. Temporary preview
publication rolls back on disconnect and its registries disappear.

After permanent DB/service activation is authorized, apply the API migrations
and run the updated API/UI. For an existing explicitly published product,
obtain its full Tracking ID and issue the stable short code:

```bash
npm run public:tracking-id -- --tenant <bytes32> --entity <bytes32>
npm run public:short-link -- --tracking-id <returned-bytes32>
# Optional HTTPS origin prints a complete link without fetching it:
npm run public:short-link -- --tracking-id <returned-bytes32> --origin https://traceforge.example
```

These instructions were not executed against permanent live schema or rows.
The CLI does not publish a product or broadcast. It rejects duplicate/unknown
flags and origins with credentials, paths, queries or fragments. Errors omit
SQL and configuration. Keep registry rows when using `public:unpublish`.

## Verification

- API production build and public discovery/tracking/presentation/security/token
  offline gates passed. `verify:public-short-links` exercises actual issuer,
  resolver, auth/rate perimeter and CLI using synthetic data without live secrets.
- `test:public-short-links` passed with real MySQL temporary tables: primary and
  unique constraints, collision retry, uppercase input, separate workspaces,
  reserved hidden codes, republishing, orphaned records and unchanged
  live counts/schema/migration ledger. Connection close discards all test rows.
- UI typecheck, production build, **22 unit tests and 54 browser checks** passed.
  Desktop Chromium and emulated Pixel 7 checks include real fixture/gateway
  requests, the single input, code/link clipboard behavior, exact pagination,
  revoked mapping cleanup, strict/private-field rejection, same internal product
  ID in separate workspaces, axe scans and mobile reflow. These fixtures are not
  shipped as live products; automated axe checks do not replace manual review.
- Hosted root CI includes the new offline API gate and full UI suite. Public
  HTTPS hosting, permanent activation, QR and operator account flows remain
  separate delivery work.

See [global identity](public-tracking.md), [public product display fields](public-product-details.md)
and the [delivery roadmap](roadmap.md).
