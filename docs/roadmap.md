# TraceForge remaining delivery phases

Updated 2026-10-05. The goal is a usable multi-tenant traceability platform:
operators record supply-chain activity safely, and consumers inspect explicitly
published provenance through a normal web/QR experience.

## Already complete

- Generic contract and private Besu QBFT reference chain, deployed on chain 9009.
- Indexer/MySQL read model, authenticated API, simulation and idempotent write engine.
- Contract authorization/custody/terminal guards, operational assets and CI baseline.
- Opt-in public entity/history API, publication CLI, privacy allowlists and offline gate.
- Encoded-path auth/rate-limit fix and public-discovery integration verification.
- [UI architecture specification](ui-architecture.md).

These are implemented foundations, not a claim that production deployment or
the end-user product is complete. The current four validators share one Pi.

## Current delivery status

The 2026-10-05 direct-claim upgrade replaces the earlier two-step custody plan.
The old development ledger and database were reset, the new contract deployed
on Pi, and all local migrations applied. Historical acceptance notes below
record earlier milestones; their temporary-write restrictions no longer apply.
See [the upgrade receipt and live checks](direct-claim-upgrade.md).

| Phase | Deliverable | Current status |
| --- | --- | --- |
| 1 | Public tracking, product details, holder names and dated history | Implemented and activated locally |
| 2 | QR download, camera scanning and manual fallback | Implemented in the Next.js UI; separate QR repository optional |
| 3 | Business registration, login, dashboard and cross-producer inventory | Implemented and activated locally; optional staff invitations retained |
| 4 | Metadata and evidence workflow | Product/evidence hashing and private storage implemented; arbitrary document uploads, retention policy and additional business schemas remain |
| 5 | Product business workflows | Create, direct receipt, close and journal statuses implemented; custom trace/state/metadata/link UI and richer interrupted-request recovery remain |
| 6 | Business configuration and administration | Independent signup registers own wallet/workspace without approval; administrator UI, account recovery/MFA and configurable workflows remain |
| 7 | Deployment and reliability | Local Pi chain/API/UI and continuous projection running; HTTPS hosting, supervised restart/reboot, load tests, shared sessions and independent validator hosts remain |
| 8 | End-to-end demonstration and evaluation | Real Producer → Distributor → Shop → Sold demo verified; broader consumer/operator evaluation and performance measurements remain |

## Phase 1 scope and acceptance

Build `ui/` as the separate Next.js App Router + TypeScript `traceforge-ui`
Git repository, registered as a root submodule. Its configured origin is
`https://github.com/aididalam/traceforge-ui.git`. The root README links all five
component repositories; each component README links back to the parent project.
Repository publication was authorized on 2026-10-05. A recursive clone checks
out their pinned commits. No machine-local URL is committed. The future QR
repository is not created in this phase.

Acceptance requires both public endpoints to work without Authorization or
cookies, strict response validation, string/BigInt cursor precision, no private
document/operator/RPC requests, no persistent provenance cache, publication
revocation clearing the view, and bounded/user-driven pagination and retries.
Browser tests use synthetic HTTP fixtures, not live tokens, DB rows or chain
writes. Empty/unpublished local data must remain 404 rather than being replaced
with a fabricated live record.

## Phase 1 verification — 2026-10-05

- Locked dependency installation (`npm ci`) succeeded with Node 22.
- Latest UI checks: typecheck, production Next build, 22 unit tests and 54
  browser checks passed. Browser projects are desktop Chromium and Pixel 7
  Chromium; the latter is an emulated profile, not a physical-device test.
- Browser checks include a real Next/public-fixture gateway round trip,
  cookie/token omission, keyboard/clipboard interaction, axe scans, cursor
  precision above `2^53`, revoked/hidden record cleanup, `Retry-After` including
  refresh/restoration, empty/closed records, invalid inputs, private-field
  rejection, plain-text labels and reflow at 320px. Automated axe checks are
  not a completed screen-reader audit or a WCAG certification.
- `npm run audit:production` reported zero vulnerabilities.
- API offline public discovery/tracking checks, temporary MySQL tracking tests
  and root ops/monitoring asset checks passed. The deployed contract and applied
  migration 004 are preserved; migrations 005, 006 and 007 are prepared but not applied live.
- Public product presentation checks passed offline and against temporary
  MySQL fixtures: reviewed product details/business names, all event dates,
  transfer attribution, stale-reference privacy and unchanged live data.
- The hosted workflow includes the UI gate. Local checks passed; a hosted run
  remains separate evidence. Public HTTPS deployment and shared-proxy rate-budget
  validation remain pending. Current live data may be unpublished and correctly
  show 404.

Run instructions are in [UI README](../ui/README.md). Development uses port
3100, leaving the existing API port 3000 separate. Browser-test artifacts are
generated under ignored `ui/test-results/`; no fixture is shipped as live data.

Phases 2–8 are separate follow-ups, not authorization to execute all of them now.
Repository publication was separately authorized. Real signer operations,
deployment and chain broadcasts remain outside this milestone. Actual immutable
writes in later phases require
the project's explicit checkpoint and successful preflight/simulation. Existing
contract deployment and applied migration 004 are preserved.

## Single-ID tracking addition — 2026-10-05

The public UI accepts one Tracking ID and supports `/track/:trackingId` as the
full-ID consumer/QR URL. A separate registry maps it to the on-chain
tenant/entity pair. Existing links remain compatible; publication gates and
private-document boundaries are preserved. Migration 005 is prepared and
verified with temporary MySQL tables; permanent DB changes/service activation
remain pending under the current DB restriction. See
[identity, verification and activation details](public-tracking.md).

## Readable product details addition — 2026-10-05

Product information now precedes current status/holder and dated supply history.
Approved business names replace hex summaries; hex IDs remain in expandable
references. All public event timestamps come from their recorded event arguments.
Migration 006 and an explicit public-details CLI prepare separately reviewed
display fields without publishing complete private documents. Metadata-reference
changes hide stale display details until reviewed again. See
[public details, tests and activation](public-product-details.md).
This is a focused consumer-view improvement; the full operator document/upload
workflow in phase 4 remains planned. Global Tracking-ID resolution is preserved.

## Short product links addition — 2026-10-05

Shareable product URLs now use `/s/<12-character-code>` and render the same
details/history while keeping the short URL. The single Tracking ID field
accepts short codes and existing full IDs. Stable database aliases are uniquely
bound to a global ID, retain reservations while unpublished, and resolve only
published existing products. Copy code/link controls, strict public lookup,
collision/concurrency checks and desktop/mobile verification are complete.
Migration 007 was tested with temporary MySQL tables and remains unapplied live.
See [short-link design and activation](public-short-links.md). QR tools and
operator dashboard/account workflows remain subsequent phases.

## Business dashboard addition — 2026-10-05

The user requested dashboard work before QR delivery. Account/invitation and
viewing access now provide `/operator`, sign-in, product lists/search/filters,
product information and named dated supply history, workspace businesses and
business-scoped operation activity. API sessions and a separate Next session
gateway enforce workspace/business membership. Browser credentials stay in
HttpOnly cookies and API credentials remain server-side. Viewing sessions have
no chain-write permission. Existing public tracking and `/v1/*` auth remain
preserved.

API build/offline operator/security/public gates, temporary MySQL account and
isolation tests, UI production build, 26 unit tests and 68 desktop/mobile browser
checks passed. MySQL tests confirmed unchanged live data/schema/ledger.
Migration 008 and real invitation/account/service activation remain pending;
no permanent account or blockchain write was performed. See
[dashboard design and activation](operator-dashboard.md). QR remains phase 2,
and receive/transfer/update/upload flows remain phases 4–5. Password recovery,
MFA, administrator web controls and a shared multi-instance session store are
follow-ups; they are not claimed complete by this viewing milestone.
