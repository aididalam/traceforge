# TraceForge UI architecture

Status: implementation specification for the future v0.30 UI, reviewed on
2026-10-05. This document creates no application, repository, submodule, or
deployment. Existing API behavior is identified separately from future work.

## Repository and first delivery

The intended root submodule is `ui -> traceforge-ui`, alongside `api`, `chain`,
`contracts`, and `indexer`. Repository creation and adding `ui` to `.gitmodules`
require a later task. A future `qr -> traceforge-qr` submodule will handle
dedicated scanning/label workflows; it is also not created by this milestone.

The first UI delivery is the public provenance page. Operator screens, login,
camera scanning, QR generation, document publication, and write controls are
future work with their own acceptance checks. Public entity listing/search is
not available in the current API and must not be built by enumerating IDs.

Recommend React + TypeScript + Vite, React Router in declarative mode, native
`fetch`, and CSS modules. The initial two-read-endpoint SPA needs a small static
deployment and no browser blockchain SDK. Keep request/state handling inside
the API client and page controller rather than scattering it through components.
Pin compatible dependencies and a supported Node version when scaffolding;
do not assume dependency versions from this document. Reconsider a framework
if server rendering or richer operator routing becomes necessary. This is a
project recommendation based on the [React setup guidance](https://react.dev/learn/build-a-react-app-from-scratch),
[Vite guide](https://vite.dev/guide/), and [React Router installation](https://reactrouter.com/start/declarative/installation).

Suggested future boundaries: `src/api/public-client.ts`, public response types
and runtime validation, `src/pages/trace/`, shared accessible display components,
and a separate operator feature tree/client. Public bundles must not import
operator credentials or signing code.

## Public page and QR contract

The UI route is `/trace/:tenantId/:entityId`. Both IDs are bytes32 values matching
`^0x[0-9a-fA-F]{64}$`; normalize to lowercase after validation. Validate route
parameters before sending a request. Invalid links get a local invalid-link
state and no API request. Encode path segments when constructing URLs.

A generated QR payload is exactly a normal HTTPS URL:

```text
https://traceforge.example/trace/<tenantId>/<entityId>
```

The hostname above is a reserved example, not an existing deployment. The
generator uses a configured canonical site origin and validated IDs. It never
adds credentials, private identifiers, signed data, query parameters, or fragments.
An identifier/URL is not permission: publication is checked by the API on every
read, and an unpublished entity's QR can remain valid while returning 404.

The public client calls only the existing endpoints:

```text
GET /public/v1/tenants/:tenantId/entities/:entityId
GET /public/v1/tenants/:tenantId/entities/:entityId/history
    ?limit=50&afterEventId=<decimal-string>
```

Use `credentials: "omit"`, no Authorization header, `cache: "no-store"`,
an abort signal, and a bounded timeout. Validate response shapes before rendering.
Keep public and operator client instances separate so shared interceptors cannot
attach a bearer token to public requests. The public client must never fall back
to `/v1/*`, a document route, a direct database query, or a chain RPC request.

## Public provenance contract

The entity response is the complete current public allowlist:

| Fields | Interpretation |
| --- | --- |
| `tenantId`, `entityId` | Tenant-scoped entity identity; show full values on demand. |
| `entityType`, `entityTypeLabel` | Type hash and nullable display label. |
| `metadataHash` | Recorded metadata hash; no document body or download is implied. |
| `currentState`, `currentStateLabel` | Current indexed state hash and nullable label. |
| `currentCustodian` | Organization bytes32 ID; no wallet address or public organization name is supplied. |
| `closed` | Boolean terminal flag, independent of the state label. |
| `createdAt`, `closedAt` | Decimal strings containing Unix seconds; `closedAt` can be null. |

Render labels as plain text, with a hash fallback for null labels. Provide
accessible copy actions and full-value expansion for abbreviated hashes. Convert
entity timestamps only after range validation; preserve the original string if
it cannot be represented as a browser date. Do not invent product names,
descriptions, certificate claims, custodian names, or tenant branding from hashes.

History returns `{ tenantId, entityId, entity, events, page }`; `entity` is the
same current projection, not an entity snapshot at each historical event.
Each event contains only:

```text
eventId, eventName, blockNumber, transactionHash, transactionIndex, logIndex,
eventType, eventTypeLabel, stateAfter, stateAfterLabel,
linkType, linkTypeLabel, metadataHash, evidenceHash
```

`eventId` and `blockNumber` are decimal strings. Keep them as strings in JSON
and state; use `BigInt` only for comparison, never convert cursors to JS numbers.
`transactionIndex` and `logIndex` are integers. Semantic/hash fields can be null.
Event timestamps, actor/role/wallet information, raw arguments, and document
bodies are absent. Do not manufacture event dates from block heights or try to
resolve hashes through the authenticated document API.

No metadata or evidence document body is public unless a future, explicit API
contract exposes it. The current authenticated document endpoint is not such a
contract. Publishing an entity grants no document access to consumers.

## Timeline and request state

Fetch detail and the first history page without automatic write effects. Use
event ID as the timeline key; display events in API order, oldest first. Show
event name, available semantic labels/hashes, block number, transaction hash,
and available metadata/evidence hashes. Do not assume events alternate in any
particular pattern, merge distinct events, or reconstruct hidden relationships.
There is no public explorer URL configured, so transaction hashes are copyable
text; external explorer links require a future reviewed configuration.

Pagination uses `page: { limit, hasMore, nextAfterEventId }`. The API defaults
to 50, permits 1..100, and bounds cursors to unsigned 64-bit integers. Use the
returned next cursor when `hasMore` is true; stop when it is false and the next
cursor is null. Do not use offsets or calculate the next cursor by adding one.
Load more on explicit user action, prevent overlapping requests, and deduplicate
by event ID if a request is retried. Abort and clear state when IDs change.

History is the available public view, not the complete private ledger. Relationship
domain events require both endpoints to be published and omit their IDs. Entity
trace hash events can still be visible. Publishing/unpublishing a linked entity
can change visibility between pages: there is no snapshot token or total count.
Offer an explicit refresh; do not describe a partial timeline as complete.

| State | Required UI behavior |
| --- | --- |
| Loading | Announce progress; use stable placeholders; cancel obsolete requests. |
| 200 with empty history | Show entity detail and an empty-public-history message. |
| 404 | Show one “Public trace unavailable” state for missing and unpublished entities; clear loaded detail/history and offer no existence probe. |
| 400 | Show invalid link/query or contract error; do not retry automatically. |
| 429 | Honor `Retry-After`, disable immediate retry/load-more, and show when a retry is possible. |
| Network timeout, 5xx, invalid response | Show API unavailable with explicit retry; preserve a QR/link input without claiming fresh provenance. |
| 401/403 from public read | Treat as configuration/contract failure; never prompt for an operator token. |

Respect `Cache-Control: no-store`. Keep public data in transient page memory;
exclude it from service-worker/offline and persistent caches. Revalidate on
explicit refresh and returning to the page; if either read returns 404, discard
the view. Never show cached data as proof that an entity is still published.

## Operator separation and future write workflow

Existing `/v1/*` routes require bearer authentication. The operator API remains
separate from the public client and must enforce token tenant/scopes regardless
of what the UI shows. Existing `GET /v1/auth/me` and `GET /v1/auth/preflight` can
provide authenticated context/preflight information to a future operator client.
There is no browser login/session endpoint or public publication mutation endpoint
today; publication remains an operator CLI action.

Recommend a future operator backend-for-frontend (BFF) that stores API credentials
on the server and gives the browser a short-lived, HttpOnly, Secure session with
CSRF/origin checks. It must enforce user-to-tenant/organization/scope mapping;
a shared unrestricted service credential is insufficient. This BFF, its login
integration, session routes, and authorization model are future work and must
be designed before operator UI delivery. Never bundle credentials, put them in
URLs, or persist bearer tokens in browser storage. Private keys, signer files,
signing and serialized transactions stay on the API's server boundary; the
browser never handles them or connects directly to Besu.

For reference, these existing generic operations use POST to the following
paths under `/v1/tenants/:tenantId/entities/:entityId`:

| Operation | Simulate suffix | Broadcast suffix |
| --- | --- | --- |
| Create entity | `/create/simulate` | `/create/broadcast` |
| Record trace | `/traces/simulate` | `/traces/broadcast` |
| Set state | `/state/simulate` | `/state/broadcast` |
| Update metadata | `/metadata/simulate` | `/metadata/broadcast` |
| Link entities | `/links/simulate` | `/links/broadcast` |
| Set link status | `/links/status/simulate` | `/links/status/broadcast` |
| Close entity | `/close/simulate` | `/close/broadcast` |

Two-step custody uses existing `/custody/proposals/simulate` and
`/custody/proposals/broadcast`, then `/custody/acceptances/simulate` and
`/custody/acceptances/broadcast` under the same entity prefix. A proposal alone
does not complete custody transfer. Request schemas come from each route's
existing OpenAPI schema; do not guess operation parameters.

Future operator writes follow this sequence:

1. Validate tenant, organization, scopes and input; call the matching simulate
   endpoint. Display safety checks and proposed immutable changes. Simulation
   does not authorize a broadcast or guarantee state remains unchanged.
2. Obtain explicit user confirmation of the exact operation and payload. Changing
   either requires another simulation and confirmation. Generic broadcast bodies
   require the existing `confirm: "BROADCAST"` value.
3. Create one `Idempotency-Key` per confirmed logical operation (a UUID satisfies
   the existing 8..128-character bound). Retain the same key and exact payload
   for retries; prevent double submission. The API owns canonical hashing,
   safety checks, signing and the write journal.
4. Call the existing authenticated broadcast route only when the deployment's
   operator write policy enables it. Broadcasting remains disabled for this
   milestone and for all tests in this task; no UI feature flag can enable the
   server's signer or override authorization.
5. Show `operationId`, transaction hash and confirmed/recovered outcomes as
   available. A timeout is an unknown outcome, not proof of failure. Confirmation
   can precede indexer projection; label “confirmed, awaiting indexed view” until
   an authenticated entity/history refresh shows the change.
6. Preserve the operation context across an interrupted request. Recovery through
   the same broadcast POST, key and payload can recover an existing journal entry
   and can re-submit its stored transaction. Make that consequence visible and
   require an explicit recovery action; never silently issue a new key. Halt on
   `idempotency_conflict` or terminal `operation_failed`; treat
   `broadcast_recovery_pending` as pending, retaining identifiers.

There is currently no GET operation-status/recovery endpoint. Do not invent one
or poll a POST in the background. A future authenticated read-only status API
and a reviewed operator draft/recovery store are needed for reliable reload and
cross-device recovery. Until then, retain exact pending payloads only in the
active operator session and explain the reload limitation; do not persist token,
private document, signer, or signed transaction data in browser storage.

## Accessibility and QR boundaries

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/): semantic headings and timeline
lists, keyboard access, visible focus, labelled controls, sufficient contrast,
responsive reflow/zoom, appropriate touch targets, and reduced-motion support.
Announce loading/errors without repeatedly reading the entire timeline. Pair
status colors with text; make complete hash values available to assistive
technology. Test focus after route changes, retry and load-more. Automated
checks supplement keyboard and screen-reader review.

QR generation (future) converts the validated public URL into an image/SVG plus
printable text; it does not publish the entity or embed API data. QR scanning
(future) decodes locally, validates HTTPS, an approved origin, exact path and two
IDs, rejects credentials/query/fragment/other schemes, and navigates to the
public page. Treat scans as untrusted input, never as instructions to call an
arbitrary URL. Provide manual URL/ID entry when camera access is denied.
Request camera permission only after user action, stop tracks on exit, and do
not upload camera frames. Browser camera access requires a secure context and
permission; see [getUserMedia guidance](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

The future `qr` submodule consumes the same URL/public-response contract and
delegates provenance display to `ui`; it must not duplicate publication/auth
decisions, expose operator clients, or bypass the API through chain access.
Extract shared URL validators/types into a reviewed package later if needed.

## Environment, proxy and deployment

Proposed UI build configuration (future `.env.example`; values are public):

```dotenv
VITE_PUBLIC_API_BASE_URL=
VITE_PUBLIC_SITE_ORIGIN=https://traceforge.example
```

An empty API base uses the page's origin. An explicit base is an approved HTTPS
origin with no credentials, query, fragment, or path prefix; allow loopback HTTP
only in local development. Append the existing full API paths once. The site
origin is the canonical externally accessible QR destination; do not derive it
from a scanned URL, query parameter, or unchecked proxy header. Fail startup/build
validation for invalid configuration. All `VITE_*` values are browser-visible,
so secrets never belong there; see [Vite environment guidance](https://vite.dev/guide/env-and-mode).

For local development, a Vite proxy can forward `/public/` to the local API while
preserving paths. For deployment, serve built static assets over HTTPS and
reverse-proxy `/public/` on the same origin to the private API listener. SPA
fallback applies to UI paths such as `/trace/...`, never to API responses.
Configure API routing ahead of static fallback. Do not expose authenticated
`/v1/*` on a consumer-only hostname; future operator access uses its separate
trusted gateway. No direct public database, signer directory, or RPC exposure.

The current API has no CORS registration; same-origin proxying is the initial
assumption. A separate API origin needs a future explicit CORS policy or a
same-origin gateway. Do not use wildcard credentialed CORS or treat CORS as
authorization. Keep unconditional `trustProxy` disabled; any future trusted proxy
list must be narrow and tested against spoofed forwarding headers. With today's
default IP handling, requests behind one proxy can share its 120/minute budget.
Measure this before public rollout. Multiple API workers also need a reviewed
shared rate-limit/edge strategy; the current in-process limiter is not a cluster
quota.

Use reproducible locked builds, immutable hashed static assets, and a short-lived
HTML shell; do not cache public API responses at the edge. Restrict CSP to the
needed UI/API origins and avoid third-party scripts on provenance/operator pages.
Treat UI and API release hashes as a compatible pair, verify HTTPS deep links,
404/429 forwarding and revocation, and provide static release rollback. Staging
must keep broadcast disabled; enabling production operator writes is a later,
explicit operational step. This specification deploys nothing.

## Threat model and testing

| Boundary/threat | Required control and limitation |
| --- | --- |
| Untrusted browser/QR to UI | Validate IDs/origin/scheme; escape all labels; no HTML injection or open redirects. |
| UI to public API | API publication gate is authoritative; identical missing/unpublished 404; no enumeration or bearer credentials. |
| Public data to document/relationship data | Render only allowlisted fields; no document fetching or hidden endpoint reconstruction. |
| Consumer to operator boundary | Separate clients/bundles and gateway; API still checks tenant/scopes; UI visibility grants no permission. |
| Operator to signer/chain | Server-held credentials and safety checks; simulation, confirmation, stable idempotency and explicit recovery. |
| Indexer/API to displayed provenance | Indexed data can lag; a recorded hash/claim does not independently prove physical authenticity or document truth. |
| Unpublication/cache | No persistent provenance cache; revalidate and clear on 404; previously viewed data cannot be recalled from a user's memory. |
| Hosting/proxy/supply chain | TLS, CSP, path routing, reviewed proxy trust, dependency lock/audit and secret-free public builds. |

UI tests should use synthetic IDs and HTTP fixtures: no real operator tokens,
keys, live Besu, signing, or broadcasts. Recommend
[Vitest](https://vitest.dev/guide/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
for validation/client/page behavior, and [Playwright](https://playwright.dev/docs/intro)
for browser deep links, state transitions, accessibility interactions and network
request assertions. Fixtures should cover nullable labels, closed entities,
empty history, event IDs above `2^53`, unsigned-64-bit cursors, changing publication
visibility, aborts, slow responses, 404/400/429, unavailable API and invalid shapes.
Assert zero public Authorization headers and zero document/operator/write/RPC
requests. QR tests cover forbidden schemes, unexpected origins, extra segments,
query/fragment credentials, camera denial and track cleanup.

Future operator workflow tests mock simulation/broadcast responses, double-clicks,
timeouts, same-key recovery, changed-payload conflicts, pending/failed/confirmed
states and indexer lag. Hosted UI CI remains deterministic with mocked API calls.
The API's DB-backed public integration test stays an explicit local test using
temporary publication rows and cleanup; hosted root CI runs only its offline
verifier. Before rollout, perform keyboard/screen-reader/mobile review and load
tests for history query scans, rate budgets and proxy behavior. No additional
publication-table index or migration is needed for the current composite-key
gate; future history optimization should follow measured query plans.
