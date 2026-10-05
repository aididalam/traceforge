# TraceForge UI architecture

Updated 2026-10-05. The `ui/` submodule is the separate
[traceforge-ui](https://github.com/aididalam/traceforge-ui) repository, using
Next.js App Router, React and TypeScript. Public tracking and business workflows
are implemented. See [current delivery status](roadmap.md) and
[the fresh-chain upgrade](direct-claim-upgrade.md).

## Public tracking

The home page has one Tracking ID input. It accepts a full bytes32 ID or a
12-character short code. `/track/:trackingId` and `/s/:shortCode` resolve to the
same product; compatible `/trace/:tenantId/:entityId` routes remain available.
Full IDs use `^0x[0-9a-fA-F]{64}$`. Short codes use
`0123456789abcdefghjkmnpqrstvwxyz`. Inputs normalize to lowercase.

`public-client.ts` and fixed Next public GET handlers validate strict response
allowlists and identity/cursor consistency. Requests omit credentials and
Authorization, disable caching and redirects, and use bounded timeouts.
Public bundles never import operator session or signing code. Each API read
checks explicit publication; missing and unpublished products share a 404.
The public client never falls back to authenticated document endpoints or RPC.

The page shows approved product details, the current business name and dated
supply history. Familiar product/status/holder wording appears first. Hex IDs,
hashes, saved event IDs and transaction references remain in collapsed details.
Names are never inferred from identifiers. Business names require explicit
profile consent; product details require explicit publication. Private metadata
and evidence documents are not published by exposing their hashes.

Event dates use recorded Unix timestamps and display UTC. Missing or
unrepresentable dates have a plain-language fallback. Event and block IDs stay
as decimal strings; BigInt comparisons preserve values above `2^53`. Pagination
uses the exact returned cursor, without offsets or overlapping requests.
Refresh and returning to a page revalidate publication and clear revoked data.
No persistent provenance cache or automatic write effect is used.

Loading, unavailable, invalid, unpublished/missing, empty history and rate-limit
states have distinct accessible messages. A 429 honors Retry-After. Errors never
claim that a cached record is still current or published. Indexed views can lag
chain confirmation; recorded claims do not independently prove physical truth.

## Business dashboard and authorization

`/operator/sign-in` supports independent business signup and email/password
login. Signup registers the business wallet and its own production workspace
on chain; no invitation or owner approval is required. A selected business type
is descriptive and grants no access to another producer's workspace. Optional
staff invitations join an existing business.

The API checks active account and global business identity. Inventory and
history include products the business produced, currently holds or previously
handled, across producers. An unrelated business cannot read private product
history simply by knowing the ID. Operation activity is restricted to the
current business and excludes signed payloads and idempotency keys.

Businesses create products in their own workspace. The form explicitly chooses
whether name, description and supply history are shared publicly. Each product
gets a Tracking ID and a downloadable QR. Production create/edit/link actions
retain workspace roles and capability checks.

`/operator/receive` accepts a full ID, short code, approved product URL or camera
QR. Lookup previews the public product name, holder, terminal state and custody
version. Scanning makes no custody change. The user must separately confirm
physical receipt. The fixed receive endpoint calls `claimCustody`, which changes
holder immediately and records previous/new business, actor, evidence, time and
version. Sender proposals, predetermined recipients and receiving workspace
roles are absent. A stale version cannot overwrite a subsequent handover.

The current holder can close an open product with Sold, Lost, Damaged or
Disposed, after explicit confirmation. Global active identity and holder checks
apply without a Shop or production-workspace role. Closed products stay readable
and cannot be received again. Customer scans only display public history.

## Browser/server boundary and writes

Fixed `/operator/api/*` handlers call only matching `/operator/v1/*` routes.
The Next server keeps the short-lived API credential in memory; browsers receive
an opaque HttpOnly, SameSite=Strict cookie, with Secure and `__Host-` prefix on
HTTPS. State-changing requests require the exact configured Origin and strict
payload schemas. Queries cannot choose an upstream URL, tenant or signer.
Response validation prevents private fields or mismatched product identities
from reaching the client. Sign-out clears the local session even if API
revocation is unavailable.

Business wallet keys remain in an owner-only API directory. The API validates
chain ID and runtime bytecode, simulates contract authorization, serializes
writes per wallet and records a journal entry before broadcast. Exact payload
and idempotency key retries reuse the same signed transaction. Confirmed
receipts are checked for the expected actor/product/event; confirmed journals
clear serialized transactions. A timeout is an uncertain outcome, not proof of
failure. The activity page provides read-only status refresh. Cross-device
write draft recovery remains future work; never invent a new key to recover an
uncertain write.

The current Next session store assumes one process, with at most 1,000 active
browser sessions. Restarting it signs users out. Shared session storage is
required before horizontal scaling. No passwords, API tokens, wallet keys,
private document bodies or signed transactions belong in browser storage.

## QR and camera

QR generation encodes a validated `/track/:trackingId` URL under
NEXT_PUBLIC_SITE_ORIGIN, falling back to the current page origin. It contains
no credentials or product document data and does not itself publish a product.
The operator scanner accepts the configured canonical origin and current site
origin. It rejects other origins, schemes, credentials, query strings, fragments
and malformed paths. Camera frames are decoded locally with jsQR and are never
uploaded. Camera access starts after a user action; tracks stop on exit or
manual stop. Manual entry remains available when the camera is denied.
HTTPS is required for normal deployed camera access; loopback supports local
browser development. Dedicated QR packaging or print layouts can be added later.

## Configuration and deployment

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_API_BASE_URL | Optional public browser API origin; empty uses fixed same-origin GET handlers |
| NEXT_PUBLIC_SITE_ORIGIN | Optional canonical HTTPS origin for QR links |
| TRACEFORGE_PUBLIC_API_ORIGIN | Credential-free API origin for the public server gateway |
| TRACEFORGE_OPERATOR_API_ORIGIN | Fixed credential-free API origin for the operator server gateway |
| TRACEFORGE_OPERATOR_SITE_ORIGIN | Exact site origin for operator Origin checks |

Origins reject credentials, path prefixes, queries and fragments. Server APIs
permit private loopback HTTP and require HTTPS elsewhere. Public variables are
embedded at build time; rebuild to change them. Never place secrets in them.
Use a Next Node runtime, not static export.

Local API/UI/projection services are activated. Public HTTPS hosting, supervised
restart/reboot, CSP/proxy/load validation and shared sessions remain delivery
work. The API currently counts gateway requests under one source IP and has an
in-process rate limiter; public rollout needs measured proxy and cluster quotas.
API broadcasting is an explicit server deployment setting; a UI control cannot
override it. Synthetic UI tests use no blockchain writes. The disposable API
integration test deliberately enables writes only against local Hardhat and its
isolated database. Compatible API/UI/contract ABI releases must be deployed
together; the reset upgrade cannot roll back simply by checking out old code.

## Verification

Vitest covers allowlists, URL validation, exact cursors, cancellation, session
rotation, Origin checks, strict write payloads and matching product identities.
Playwright runs desktop and mobile Chromium against a production Next build
and synthetic API fixtures. It covers public history/privacy/errors, signup,
login/invitations, QR decoding, receipt and close confirmation, logout and axe
accessibility checks. These tests use no live API credentials or keys.

The API integration test creates a disposable MySQL database and local Hardhat
contract. It exercises independent signup, actual writes, cross-producer receipt,
stale/idempotent retries, holder-only close, terminal guards, publication/privacy,
disabled broadcasts and repeatable projection. Separate live checks verified
the Pi supply chain and actual local browser login/tracking. Broader manual
screen-reader review, account recovery/MFA, arbitrary document uploads and
production load/fault evaluation remain in the roadmap.
