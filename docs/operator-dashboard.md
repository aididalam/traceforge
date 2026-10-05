# Business dashboard and account access

Implemented 2026-10-05 following the user's request to continue with the dashboard.
This delivers the viewing/access portion of phase 3. QR delivery remains phase 2;
product updates, receiving/transferring and uploads remain phases 4–5.

## User experience

The header links Product tracking and Business dashboard. The latter uses
`/operator`, with an email/password sign-in screen at `/operator/sign-in`.
An invited user selects I have an invitation, enters name/email/invitation code,
and creates a password. The form then returns to sign-in and clears credentials.

The dashboard contains Overview, Products, Businesses and Operation activity.
Products show names, current status and current holder. Search and filters apply
to loaded products; Show more products retrieves additional records. Counts say
loaded/shown rather than claiming totals. A product opens its description,
selected product fields and dated supply history with named businesses. Internal
IDs and transaction references remain available in expandable details. Operation
activity shows the latest 50 entries for the user's business, with prepared,
awaiting confirmation, confirmed and failed statuses. Refresh uses reads only;
confirmed operation status does not claim the indexer has already caught up.

No receive/transfer/update controls are enabled in this delivery. Those workflows
need the separately reviewed simulation, confirmation, signing and recovery
sequence. Account roles/administration, recovery/password reset, MFA, uploads and
multi-workspace accounts remain further work. The current account model permits
one workspace/business per unique email, and grants viewing access only.

## API authorization and data boundary

Migration 008 creates `operator_accounts`, `operator_invitations` and
`operator_sessions`. Accounts bind a user to an existing indexed workspace and
business. An administrator issues an email-bound 24-hour invitation locally;
activation checks that binding, expiry, single use and current membership inside
a transaction. Unique email/account constraints prevent duplicate registration.
There is no public signup without an invitation and no email delivery action.

The new `/operator/v1/*` API namespace is separate from existing `/v1/*` token
routes and `/public/v1/*` provenance. Login/activation are rate-limited endpoints;
other operator routes require the new short-lived bearer session, held only by
the UI server. Every read checks session expiry/revocation plus active account,
workspace, business and workspace membership. A client cannot choose a different
workspace through a path/query/header. Product/history queries are scoped to the
account's workspace; operation-status reads also require its business. Existing
API tokens, scopes, auth hooks and public opt-in gates remain unchanged.

Products include only name, description, selected units/packaging/quality/revision
fields, status/type labels, current-holder name, creation date and internal ID.
Businesses include name/type and active status. History includes recorded event
names/dates, business/transfer IDs and transaction references, with labels
resolved in the configured chain/contract scope. Raw event arguments and document
bodies are not selected or returned. Operation-status SQL selects a small
allowlist; it never reads signed transactions, request payloads, idempotency keys,
errors, token IDs or signer material. Unpublished products are available to an
authorized account without changing what is public.

Passwords use salted scrypt (`N=131072, r=8, p=1`) and constant-time comparison.
Two simultaneous hash operations per process bound memory demand. Unknown,
disabled, locked or wrong-password logins share a generic failure. Five failed
attempts lock an account for ten minutes; login/activation have separate per-IP
limits and all operator routes join the existing global IP budget. Session and
invitation values use 32 random bytes; only SHA-256 digests are stored. Sessions
have an absolute 30-minute lifetime and logout marks the session revoked.
Expired/revoked rows are removed during the account's next login; active-session
issuance is capped per account. No secrets are logged in operator error handling.

Password parameters follow the [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Cookie and server expiry choices follow the [OWASP session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
These references describe controls, not a certification or completed security audit.

## Next session gateway

Fixed `/operator/api/*` route handlers validate requests and strict response
contracts before calling the configured API origin. They forward fresh headers,
never incoming Authorization, Cookie, forwarding headers or arbitrary target
URLs. Redirects are rejected; queries and duplicate pagination values fail closed.
The existing public client/gateway stays token-free and separate.

Successful login creates a new opaque browser session whose digest maps to the
API session credential in Next server memory. The API credential never appears
in browser JSON, HTML, URLs or storage. The browser cookie is HttpOnly and
SameSite=Strict; HTTPS uses Secure and the `__Host-` prefix. Loopback development
uses an HttpOnly local cookie. POSTs, including login and logout, require the
exact configured Origin; cross-site fetch metadata is rejected. All responses
use no-store and Vary: Cookie, and credential bodies have a 4 KiB bound.

This store supports one Next process and at most 1,000 active browser sessions.
Restarting it signs users out. A shared server session store is required before
multiple Next workers/instances; this delivery does not claim that deployment
support. Returning from a hidden/restored page revalidates access, hides stale
records and respects known Retry-After delays. Logout always deletes local
credentials even if API revocation is temporarily unavailable; the API's original
30-minute expiry still bounds that unavailable remote session.

## Activation and configuration

Migration **008 has not been applied live**, and no real account or invitation
has been created. Migrations 005–007 for public features also remain pending.
Current authorization allows temporary DB test rows with cleanup only; this work
used temporary account/model tables and verified unchanged live schema/data.
No user service was replaced and no blockchain write, deployment or signer
operation was performed.

After permanent DB/service activation is separately authorized, apply the API
migrations, run the updated API and configure the UI server:

```text
TRACEFORGE_OPERATOR_API_ORIGIN=https://api.example
TRACEFORGE_OPERATOR_SITE_ORIGIN=https://dashboard.example
```

These are reserved example domains. A colocated private API can use loopback
HTTP; public hosting must use the deployed HTTPS site origin. Neither variable
contains a token or password, and neither is a NEXT_PUBLIC variable. Development
examples use API 3000 and UI 3100 in `ui/.env.example`.

An administrator can then run:

```bash
npm run operator:invite -- --tenant <bytes32> --organization <bytes32> --email <email> --output <new-private-file>
```

The CLI checks active membership, uses a new 0600 file, refuses overwriting and
rolls back/removes its new file if issuance fails before commit. Deliver the
invitation privately. Account or membership disablement immediately prevents
future session reads; administrator web controls are not included yet. Existing
real operator tokens are not a login input for this UI and were not inspected.

## Verification

API production build, offline operator and existing public/security/token gates
passed. The operator gate uses actual source, synthetic DB responses, real
password hashing and Fastify routes/auth/rate limits. Real MySQL tests use
connection-local temporary tables and close them in finally; activation, hashed
credentials, single-use binding, exact large cursors, other-workspace product
404s, other-business operation isolation, recorded transfer dates, disablement,
logout and expiry are covered. Identical empty mirrors handle MySQL's temporary
table alias restriction without changing query predicates or parameter values.
Live entity/publication/write counts, operator table existence and migration
ledger remain unchanged.

UI typecheck, production build, **26 unit tests and 68 desktop/mobile browser
checks** passed. Tests include real Next/synthetic API login and private gateway
round trips, cookie flags, zero browser Authorization/local/session storage,
CSRF/target/method rejection, invitation form, filters, businesses, operation
status, named dated history, large cursors, revoked-session clearing, visibility
restoration and Retry-After. Public tracking and short-link regression checks
also pass. Automated axe checks and emulated Pixel 7 tests complement future
manual accessibility and physical-device testing.

Hosted CI uses the offline gate and synthetic browser fixtures. It has no live
MySQL/Besu/account credentials or chain writes. HTTPS deployment, shared session
storage, recovery/MFA and measured proxy/load behavior remain deployment work.
