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

## Delivery order

| Phase | Deliverable | Completion evidence | Status |
| --- | --- | --- | --- |
| 1 | Public web UI foundation (Next.js) | `/trace/:tenantId/:entityId`, validated token-free API client, safe timeline/cursors, loading/404/429/unavailable states, mobile/keyboard/accessibility tests, production build and CI gate. | Complete locally; remote publication pending |
| 2 | QR generation and scanning | Canonical HTTPS URL payload, printable labels, approved-origin scanner/manual fallback, camera lifecycle and malicious-payload tests; future `qr` component. | Planned |
| 3 | Operator access and dashboard | Reviewed login/session gateway, tenant/organization/scope enforcement, authenticated read views and safe read-only operation-status API; no browser signing or bundled bearer credentials. | Planned |
| 4 | Metadata and evidence workflow | Schema validation, canonical hashing, private document storage/import/upload, authorized resolution and retention. Any public document access needs an explicit separate publication policy. | Planned |
| 5 | Operator business workflows | Entity/trace/state/metadata/link/close UI, two-step custody, simulate → confirm → stable idempotency → broadcast → recovery; pending/failed/confirmed/indexer-lag behavior. | Planned |
| 6 | Onboarding and business configuration | Tenant/organization/wallet/role/capability administration, semantics/workflow setup, missing administrative APIs and isolation tests. | Planned |
| 7 | Deployment and reliability validation | Linux/Pi service installation/reboot, HTTPS/proxy controls, continuous indexer operation, backup/restore drill, monitoring/alerts, load/security checks, independent validator hosts and fault tests. | Planned |
| 8 | End-to-end demonstration and evaluation | Reproducible supply-chain demo, consumer/operator acceptance, provenance/security proofs, performance/operational cost/usability measurements and research comparison. | Planned |

## Phase 1 scope and acceptance

Build `ui/` as the separate Next.js App Router + TypeScript `traceforge-ui`
Git repository, registered as a root submodule. Its configured origin is
`https://github.com/aididalam/traceforge-ui.git`. The remote was unavailable when
checked on 2026-10-05. The local repo/gitlink are implemented under the user's
submodule instruction; GitHub creation/publication remains pending under the
prior no-create/no-push instruction. A fresh remote clone will need the UI
commit and other local submodule commits published before it can reproduce
this checkout. No machine-local URL is committed. The future QR repository is
not created in this phase.

Acceptance requires both public endpoints to work without Authorization or
cookies, strict response validation, string/BigInt cursor precision, no private
document/operator/RPC requests, no persistent provenance cache, publication
revocation clearing the view, and bounded/user-driven pagination and retries.
Browser tests use synthetic HTTP fixtures, not live tokens, DB rows or chain
writes. Empty/unpublished local data must remain 404 rather than being replaced
with a fabricated live record.

## Phase 1 verification — 2026-10-05

- Locked dependency installation (`npm ci`) succeeded with Node 22.
- `npm run verify`: typecheck, production Next build, 13 unit tests and 26
  browser checks passed. Browser projects are desktop Chromium and Pixel 7
  Chromium; the latter is an emulated profile, not a physical-device test.
- Browser checks include a real Next/public-fixture gateway round trip,
  cookie/token omission, keyboard/clipboard interaction, axe scans, cursor
  precision above `2^53`, revoked/hidden record cleanup, `Retry-After` including
  refresh/restoration, empty/closed records, invalid inputs, private-field
  rejection, plain-text labels and reflow at 320px. Automated axe checks are
  not a completed screen-reader audit or a WCAG certification.
- `npm run audit:production` reported zero vulnerabilities.
- Existing API `npm run verify:public-discovery` and root ops/monitoring asset
  checks passed. API/schema/contracts/indexer behavior was not changed.
- UI and root changes are local commits. The hosted workflow includes the UI
  gate; GitHub Actions was not run for unpublished commits. Remote creation,
  pushing, public HTTPS deployment and shared-proxy rate-budget validation
  remain pending. Current live data may be unpublished and correctly show 404.

Run instructions are in [UI README](../ui/README.md). Development uses port
3100, leaving the existing API port 3000 separate. Browser-test artifacts are
generated under ignored `ui/test-results/`; no fixture is shipped as live data.

Phases 2–8 are separate follow-ups, not authorization to execute all of them now.
No push, remote repository creation, real signer operation, deployment or chain
broadcast is part of Phase 1. Actual immutable writes in later phases require
the project's explicit checkpoint and successful preflight/simulation. Existing
contract deployment and applied migration 004 are preserved.
