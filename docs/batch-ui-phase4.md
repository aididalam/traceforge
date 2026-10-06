# Batch upgrade — Phase 4 UI

Implemented 2026-10-06 in the Next.js `ui/` submodule. This phase consumes the
[Phase 3 API](batch-api-phase3.md) and follows the
[quantity and route specification](batch-quantity-plan.md).
The upgrade was subsequently activated against Pi in
[Phase 6](batch-activation-phase6.md). The checks below record the Phase 4 UI
implementation milestone.

## Delivered flows

- Products → Add product requires Product name and Product / batch ID. The
  business's reference stays literal; duplicates are allowed. Batch product is
  unchecked initially. A checked batch requires a safe whole-number quantity of
  at least two; unchecked submits one. Turning batch off discards its entered
  count. Dynamic details remain JSON fields; canonical identity/count labels
  cannot be duplicated as custom fields.
- Signup accepts an optional custom business code and displays the reserved
  code returned by the API. The sidebar shows the signed-in business's code.
  Registration suggests `CODE / YOUR-ID` through an explicit button; it never
  silently rewrites an existing reference.
- One lookup input accepts a short/full Tracking ID, approved product link or
  the business's product/batch reference. Exact external-ID search supports an
  optional originating-business code. Multiple matches show names, origin,
  original ID and availability before selection. The explicit Search product /
  batch ID button also handles business references that resemble a tracking code.
  Changing input cancels old reads and clears prior selections. Additional
  result pages load only after a user action.
- Operator receipt previews separate global available stock from the caller's
  stock. Batch receipt selects an available source owned by another business,
  an integer amount within that receipt's balance, and explicit physical
  confirmation. Multiple receipts at the same business show previous business,
  date/time and expandable references. Source pages are bounded; selected
  versions remain exact decimal strings. A unique eligible source can be
  preselected on a complete single-page result, without submitting a receipt.
- Removal is available only when the business owns available stock. A batch
  selects an owned receipt and an amount within it; global closure is not
  inferred from a local receipt reaching zero. Sold is the default reason;
  Lost, Damaged, Spoiled, Disposed and Other require a written explanation.
  Text is bounded to 256 Unicode code points and 1,024 UTF-8 bytes. Newly
  registered singles use versioned whole-item removal without a batch input.
  Legacy generic singles retain their compatible close endpoint and older
  reason options.
- Public tracking shows X out of Y available, original product/batch ID,
  removed totals by reason, consented current business names and per-business
  stock. A verifier can inspect paginated available receipts without recording
  a handover. Quantity and reason text are shown beside dated history updates.
  Status remains In supply chain / Out of supply chain. Sold is a removal
  reason, never the product's status or a suffix added to its name.
- Confirmed registration displays the issued short code and generates its short
  QR link. Full Tracking IDs remain available under references. Product-detail
  responses currently do not include an alias, so that page's QR uses the full
  Tracking ID; both resolve the same root registration. Private codes remain
  usable for authenticated receipts while public lookup requires publication.

## Writes, privacy and limits

Creation, receipt and removal freeze the original request and operation key
while confirmation is uncertain. Check confirmation resends the same payload;
inputs cannot quietly change its quantity, source, reason or key. A stale-stock
rejection requires an explicit refresh/new attempt. Confirmed updates are
reloaded through the existing dashboard refresh after projection catches up.

Fixed Next route handlers add search, routes, holders, quantity and removal;
there is no arbitrary target proxy. Request and response schemas reject unknown
fields and invalid pagination. Mutation responses must match the requested
product and declared batch quantity/removal reason/text. Session credentials
remain server-side behind HttpOnly cookies and exact-origin mutation checks.
Revoked sessions during actions return to sign-in. Public requests omit cookies
and authorization; unavailable/revoked public holder or receipt pages clear the
parent trace through revalidation. Publication and profile consent remain API
responsibilities; exact-code authenticated preview does not expose private
metadata or grant private full-history access.

Global and own-stock totals come from API summaries, never sums of visible rows.
Search, route, holder and history reads request at most 50 rows per page;
responses are bounded to 100. A million-item removal is one quantity operation.
Bootstrap controls, neutral layout, keyboard labels, responsive sidebar and
expandable technical references are retained.

## Verification

Validation uses synthetic records and isolated fixture servers, not the live
Pi ledger or DB. Evidence: [batch-ui-phase4-evidence.json](batch-ui-phase4-evidence.json).

- TypeScript check and separate production build passed.
- 43 unit tests passed, covering stock conservation, precision, required IDs,
  unsafe quantities/Unicode, reserved metadata fields, explanation rules,
  response allowlists, session/CSRF boundaries, fixed query paths and public
  credential omission.
- 104 desktop/mobile Playwright checks passed, including existing tracking and
  dashboard regressions plus batch registration, short QR decoding, duplicate
  search, exact source/version selection, own-source/excess-quantity rejection,
  reasoned removal, pending retries, custom business codes, publication revocation
  and expired-session handling.
- Automated axe accessibility checks and horizontal-overflow checks passed on
  the new flows. Desktop/mobile screenshots were generated and visually reviewed.

Reproduce without replacing a running default `.next` build:

```bash
cd ui
npm run typecheck
npm test
TRACEFORGE_UI_DIST_DIR=.next-phase4 NEXT_TELEMETRY_DISABLED=1 npm run build
TRACEFORGE_UI_DIST_DIR=.next-phase4 npm run test:e2e
```

The test servers use ports 4178 and 4202 and clean up after the run. The optional
build-directory variable is inherited by Next's test server; ordinary builds
and CI continue to use `.next` by default.

## Next phases

Phase 5 validates the assembled contract/indexer/API/UI flow on a disposable
chain/database, including concurrency and replay. Phase 6 deploys the new Pi
contract, applies migration/rebuild or agreed reseeding, activates matching
services, performs real operations and records deployment evidence. No batch
migration, old-data deletion or new contract deployment was performed in Phase 4.
