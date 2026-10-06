# Product IDs, batch quantities and supply routes

Updated 2026-10-06. Phase 1 specifies the next product workflow. This document
describes the target behaviour; the running deployment still has one custodian
per product and whole-product receipt/removal. Phase 2's contract is implemented
and tested; phases 3–4 implement the API and UI; phases 5–6 validate and activate the design below. See the
[contract implementation and validation](batch-contract-phase2.md),
[API implementation](batch-api-phase3.md) and [UI implementation](batch-ui-phase4.md).

## Delivery phases

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Registration metadata, route/accounting model and API specification | Specified here; implementation not yet activated |
| 2 | Contract quantity accounting, route receipt and reasoned removal | Implemented; 107 contract tests and isolated compatibility passed; not deployed |
| 3 | Indexer projections, database migrations, search, aliases and API | Implemented; isolated integration and replay passed; not activated |
| 4 | Next.js registration, receipt, removal and tracking views | Implemented; 43 unit and 104 browser tests passed; not activated |
| 5 | Contract, disposable integration and desktop/mobile acceptance | Planned |
| 6 | Pi deployment, migration/reseed, real operations and documentation | Planned |

This sequence extends the existing delivery roadmap. HTTPS hosting, account
recovery, process supervision and the other remaining platform work are not
completed by this batch upgrade.

## Registration and identity

The business's `id` is a required product, batch or serial reference. It is text,
trimmed at its ends, case-preserving, nonblank and at most 120 characters, with
control characters rejected. Different products may have the same `id`, even
within one business. No global uniqueness constraint applies to this field.

`quantity` is the number of items originally registered. Omission means `1`.
Accepted values are JSON integers from `1` through `9007199254740991`; null,
numeric strings, booleans, fractions, zero, negatives and larger values are
rejected. This API bound keeps item counts exact in JavaScript; contract storage
uses unsigned integer accounting and applies the same registration bound.
Fractional weight/volume accounting is outside this version. Size, volume and
other descriptions remain optional metadata fields.

Classification uses original quantity: `1` means a single product; greater than
`1` means a batch. There is no separate stored batch flag. A batch with one item
remaining, or a route receiving just one item from a batch, remains part of the
original batch. A registration originally containing one item is a single.

The canonical registration document has this shape:

```json
{
  "schemaVersion": 2,
  "name": "Cola bottles",
  "id": "A/BATCH-20261006-001",
  "quantity": 1000000,
  "fields": [
    { "label": "Bottle size", "value": "500 mL" },
    { "label": "Description", "value": "Returnable glass bottles" }
  ]
}
```

The server always writes the resolved default quantity into this document.
The existing exact-byte JSON hashing model is retained. Additional fields keep
their current limit of 32, unique case-insensitive labels up to 80 characters
and nonblank text values up to 1,000 characters. Reserved labels, compared after
trimming and case folding, are `id`, `quantity`, `schemaVersion`, `name`,
`Product name`, `Product / batch ID`, `Initial quantity` and `Number of items`.
They cannot be supplied as additional fields with conflicting values. There is
no dedicated description
input; a Description custom field works. Legacy description documents remain
readable.

The original registering business, registration metadata hash, `id` and initial
quantity establish the root identity. Transfers and removals do not rewrite
them. Current available counts are contract state, not editable metadata. If
later metadata editing changes names/details, registration identity/counts
continue to resolve from the original hash-bound document. A conflicting
document must not override on-chain initial quantity or the registered `id`.

Each registration also has one globally unique TraceForge Tracking ID and one
stable 12-character short code. Both identify the whole registered product or
batch, across all its routes. Individual routes have internal unique IDs; a
route is not a new product registration. Codes are assigned for private as well
as shared registrations, but public resolution still requires publication.
Changing holder or exhausting a route never changes the product's code.

## Quantity and route model

A batch starts with one root route owned by the registering business. Each
confirmed receipt from a batch creates a child route with a unique ID and a
parent/source route reference. The source keeps any remainder. A complete
receipt leaves zero at the source and the full quantity at the child. Returning
to a previous business creates a new child, retaining the actual route history.

Each route stores its owner, parent route, received quantity, available quantity,
forwarded quantity, removed quantity and a monotonically increasing version.
The route owner is fixed for that receipt; subsequent handovers create children.
Two receipts into the same business remain distinct routes. Business summaries
sum those routes, but a later receipt/removal identifies the exact source route.

Route IDs are nonzero bytes32 values unique within a registered product. The root
ID is derived from a root-route domain, chain ID, contract, tenant and entity.
The API derives a child ID from a separate receipt-route domain, the same product
scope, source route, receiver organization and hashed idempotency key using ABI
encoding. The contract rejects reuse of an existing child ID. Different retries
of one confirmed request therefore identify the same route; a new confirmed
receipt creates a new route even when its business and quantity match an earlier
receipt.

The contract maintains these invariants without iterating over every holder:

```text
product.initialQuantity = product.availableQuantity + product.removedQuantity
product.availableQuantity = sum(route.availableQuantity)
route.receivedQuantity = route.availableQuantity + route.forwardedQuantity + route.removedQuantity
product.removedQuantity = sum(removal.quantity)
```

Transfer changes route balances but not the product's global available or removed
quantity. Removal decreases global available quantity and increases removed
quantity by exactly the same amount. Quantity cannot be minted, increased,
re-added after removal or moved between unrelated product registrations through
this workflow.

Example with a batch of one million items:

| Step | Producer available | Distributor A available | Distributor B available | Shop available | Global available | Global removed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Register | 1,000,000 | 0 | 0 | 0 | 1,000,000 | 0 |
| A receives 600,000 | 400,000 | 600,000 | 0 | 0 | 1,000,000 | 0 |
| B receives 400,000 | 0 | 600,000 | 400,000 | 0 | 1,000,000 | 0 |
| Shop receives 300,000 from A | 0 | 300,000 | 400,000 | 300,000 | 1,000,000 | 0 |
| Shop sells 100,000 | 0 | 300,000 | 400,000 | 200,000 | 900,000 | 100,000 |
| Shop records 200 lost and 500 spoiled | 0 | 300,000 | 400,000 | 199,300 | 899,300 | 100,700 |

One removal of 100,000 items is one operation, not 100,000 individual records.
An empty route after forwarding means that business holds no items on that
route; it does not mean those items were sold or removed from the supply chain.
The batch becomes Out of supply chain only when global available quantity is
zero. Empty/removed routes and their provenance remain readable.

### Receipt and removal rules

- A signed-in active business selects an available source route, declares the
  received quantity and confirms physical receipt. Sender proposals, invitation,
  origin-workspace membership and receiving-role approval remain unnecessary.
- The receiver must differ from the selected route owner. Quantity is positive
  and no greater than that source route's current available quantity.
- The contract checks the expected source-route version. Each debit/receipt or
  removal increments it, so competing or stale requests must refresh. Checks and
  updates are atomic; retries use the existing idempotent write journal.
- Only a route's current owner can remove items from that route. A business that
  owns multiple routes chooses the route to debit. Cross-route bulk removal can
  be a later convenience; it must retain attribution to each route.
- Removal defaults to `Sold`. The other choices are `Lost`, `Damaged`, `Spoiled`,
  `Disposed` and `Other`. Non-Sold reasons require a nonblank written explanation;
  Sold may also include one. Reason text is plain text, at most 256 Unicode code
  points and 1,024 UTF-8 bytes, with unsafe control characters rejected.
- Removal events record quantity, reason code, the actual written reason,
  organization, actor, source route, timestamp and evidence hash on chain. The
  reason is not stored only as an off-chain hash. Evidence JSON remains useful
  for receipt confirmations and the existing document audit workflow.
- A customer/verifier scan, search, route selection or preview is read-only.
  A business explicitly confirms receipt or removal to change state.

Single products retain whole-item receipt/removal: quantity is implicitly `1`,
receipt changes the sole custodian, and removal ends that single's participation.
They do not need a batch quantity input or multiple-holder UI. Reason defaults
and explanations apply to single removal too. The new contract's legacy
whole-product claim/close entry points must explicitly reject batches, so a
caller cannot bypass partial-quantity accounting.

New registered singles also use reasoned `removeProduct` on chain. Legacy
`closeEntity` remains for generic entities and rejects these registrations;
the HTTP `/close` compatibility path dispatches to the new single removal.

## Contract and indexer changes

New business-product creation must register initial quantity in contract state
as well as in the hash-bound metadata. A batch must not derive holder authority
from `Entity.currentCustodian`; its route balances are authoritative. Generic
methods that assume one custodian cannot serve as a batch receipt/removal path.

The contract interface must provide quantity registration/readback, source-route
readback, batch receipt and quantity removal. Registration creates the root
route; receipt emits both source and child IDs and changed balances; removal
emits the updated source/global counts and reason. Events must contain enough
information to rebuild route ancestry, balances, versions and reason totals
without fetching a million-item array or trusting off-chain totals. Single
receipt and whole-item removal remain supported.

Phase 2 fixes the ABI/event layouts with contract tests, updates the checked-in
ABI consumers, and measures runtime bytecode/gas against the deployment limits.
Receipt verification must match the exact actor, source/child route, quantity,
reason, evidence and expected new version, not merely an event name.

Phase 3 adds deployment-scoped product-quantity, route and quantity-movement
projections, plus registered-ID lookup indexes. Derived balances can be rebuilt
from canonical logs. A replay must produce the same balances and route ancestry.
Raw logs remain available; public/operator history shows one business operation
per action and applies cursor pagination before returning a bounded page.

| Component | Main implementation surfaces |
| --- | --- |
| Contracts | `contracts/TraceForge.sol`, custody/lifecycle tests and new quantity/route tests; compiled ABI/runtime report |
| Indexer | `abi/TraceForge.abi.json`, quantity/route migrations, `src/project.ts`, `src/entity-history.ts` and replay checks |
| API | Read/write ABIs, `business.ts`, `business-write.ts`, operator/public routes, metadata validation, short-link allocation, DB migrations and receipt checks |
| UI | `operator-contract.ts`, product actions/metadata, public trace viewer, search/source selection and signup/profile business-code display |
| Root/chain | CI disposable integration, network/deployment manifests, activation receipts, roadmap and component documentation |

## API specification

The paths below extend the business API. Phase 3 implements the API routes and
response schemas; phase 4 adds the matching fixed Next.js gateway routes and UI
client contracts. The current UI remains on the running legacy deployment until
those consumers and activation checks are ready. Every state-changing operation
retains an idempotency key, simulation, journal-before-broadcast and verified
transaction receipt.

### Registration

`POST /operator/v1/products/create`:

```json
{
  "name": "Cola bottles",
  "id": "A/BATCH-20261006-001",
  "quantity": 1000000,
  "fields": [{ "label": "Bottle size", "value": "500 mL" }],
  "publish": true,
  "idempotencyKey": "register-batch-20261006-001"
}
```

`name`, `id`, `publish` and `idempotencyKey` are required. `quantity` defaults to
`1`; `fields` defaults to an empty array. The legacy `description` request may
remain optional for existing clients, but the new form does not send it as a
required field. Normalization occurs before request hashing: missing quantity
and explicit `1` are the same request. Changed payload with the same key is a
conflict; the same external `id` with a new key is a separate registration.

The write response retains `operationId`, `status`, `transactionHash`,
`blockNumber` and `trackingId`, and adds `shortCode`. A `CONFIRMED` response must
contain a reserved code. Before confirmation, `shortCode` may be null; retrying
the original request obtains the same confirmed identity/code. Code allocation
must not depend on projector timing or public sharing. It remains unique and
stable under retries/concurrent issuers.

### Search and scan preview

| Endpoint | Behaviour |
| --- | --- |
| `GET /operator/v1/products/search?id=...&businessCode=...&after=...&limit=...` | Exact external-ID matches; optional originating-business filter; shared products plus the caller's authorized products |
| `GET /public/v1/products/search?id=...&businessCode=...&after=...&limit=...` | Same lookup for explicitly shared registrations only |
| `GET /operator/v1/receive/:trackingId` | Resolve a full ID/short code, return product summary and a bounded first page of source routes; no write |
| `GET /operator/v1/products/:productId/routes?after=...&limit=...` | Available source routes and current versions; bounded receipt-preview access |
| `GET /public/v1/tracking/:trackingId` and existing short-link resolver | Preserve identity resolution and publication gates |
| Public product details/routes/history | Shared metadata, global counts, consented names, active routes and paginated actions |

Search matches the stored trimmed `id` without case folding or treating the
business's reference as a unique key. DB lookup collation must preserve this
behaviour. An optional business-code filter refers to the original registering
business, not today's holder. A business prefix inside `id` is literal text;
do not automatically split arbitrary slashes in existing business IDs.

Results show product name, registered reference, consented origin/current names,
classification and availability. Duplicated references require product selection
first, then source-route selection if necessary. One active source may be
preselected. Multiple routes at one business must be distinguishable by their
previous business, receipt time and route reference. Preselection never submits
a receipt. New searches clear previous product/route selections.

Private product details must not leak through external-ID search, counts or
pagination. Exact tracking-code possession may still provide the existing
minimal authenticated receipt preview; it does not publish metadata or grant
full inventory/history access. Public resolution/search remains publication
gated. Holder names keep their existing consent policy.

### Batch receipt

`POST /operator/v1/products/:productId/receive` accepts this batch body:

```json
{
  "sourceRouteId": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "quantity": 250,
  "version": "3",
  "confirmed": true,
  "idempotencyKey": "receive-batch-part-001"
}
```

Source ID and quantity are required for batches. Version is the selected source
route version, not one shared product version. A confirmed response adds the
deterministic `receivedRouteId` and quantity to the normal operation result.
Single receipt retains its version/confirmation body and implicitly receives
one item. The server derives the receiver from authentication, not the body.

### Removal

The existing `/products/:productId/close` path remains a compatibility entry
point for singles. The canonical new action is
`POST /operator/v1/products/:productId/remove`:

```json
{
  "routeId": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "quantity": 20,
  "version": "5",
  "reason": "Spoiled",
  "reasonText": "Packaging damaged during storage",
  "confirmed": true,
  "idempotencyKey": "remove-spoiled-part-001"
}
```

Batch removal requires route, quantity and version. Single removal implicitly
uses quantity `1` and its custody version. Omitting reason resolves to `Sold`;
reason text follows the rules above. A confirmed response reports the removed
quantity and actual reason. Removing all of one route must never close other
routes. Whole-batch automatic termination follows the global balance, not a
shop's local balance or the reason Sold.

Read responses serialize quantities, timestamps and versions as decimal strings
to preserve precision through the database/JSON boundary. Product summaries
include `initialQuantity`, `availableQuantity`, `removedQuantity`, `isBatch` and
`inSupplyChain`. Batch route rows include route/parent IDs, owner attribution,
available quantity, receipt time and version. Global reason totals and the
caller's own available quantity are distinct fields; neither is the sum of just
the current page. Route/history pages use bounded cursor pagination, with a
default of 50 and maximum of 100 rows.

## Optional business codes

Business codes are DB-only conveniences for printed references. They never
replace blockchain organization identity, authorize receipt or change on
transfer. The dashboard may suggest `CODE / YOUR-ID`; using the suggestion is
optional and never silently rewrites a supplied product ID.

Codes use uppercase ASCII letters/digits, 1–16 characters. Input is trimmed and
uppercased; a code is reserved once and not recycled. Custom codes are accepted
when available. Concurrent reservations rely on a DB uniqueness constraint.

Automatic allocation tries all one-character combinations before two-character
combinations, then three, using alphabet `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`.
All leading-character combinations count: `AA`, `AB`, ... are valid. A
transactional counter and unique reservation skip custom codes already taken;
ordinary decimal auto-increment converted to a string is not this allocator.
Existing businesses receive codes during the migration. Optional signup
`businessCode` and the authenticated profile expose the reserved value; business
names/code lookup continue to follow the profile visibility policy.

## UI behaviour

Product creation remains Products → Add product. Below required Product / batch
ID, an unchecked Batch product checkbox resolves quantity to `1`. Checking it
shows Number of items with minimum `2`. Clearing it resets submitted quantity
to `1`. The checkbox is a form convenience, not stored classification. Existing
Bootstrap controls, visible labels and the mobile sidebar remain.

Batch public tracking shows **X out of Y available**, global removal totals by
reason, and a paginated current-holder/route view. The operator dashboard also
shows the signed-in business's own available quantity. Route details preserve
separate provenance even when holder summaries are grouped. View activity opens
paginated dated operations; all operations are not rendered at once.

Single pages keep the current whole-item controls. Status labels for both kinds
remain **In supply chain** / **Out of supply chain**; Sold is a removal reason,
not a product-name suffix or universal terminal status. A removed single or
fully exhausted batch remains readable and cannot be received again.

## Acceptance and activation

Phase 1 has specified the metadata, equations, route selection, reason storage,
API inputs/defaults and publication boundaries. Its checks validate example JSON,
the accounting walkthrough and documentation links; they do not claim contract
or application implementation tests for this upgrade have passed.

Phases 2–5 must verify:

- Omitted/explicit-one quantity, required ID, duplicate IDs, reserved fields,
  invalid counts and exact large-integer bounds.
- Single receipt/removal, a batch starting at one million, partial/full source
  receipt, two independent holders, returns, two routes into one business and a
  batch route with only one item remaining.
- Partial sold/lost/spoiled removal, custom on-chain reason text, non-owner
  rejection, overdraw rejection, stale competing receipt/removal and final
  global exhaustion. Whole-item methods cannot bypass batch rules.
- Conservation after every operation, unchanged global totals on transfer,
  one bulk-removal action, receipt-payload verification, unchanged retries and
  changed-payload conflicts across normalized defaults.
- Indexer replay, deployment isolation, DB/contract equality, alias races,
  business-code length transitions/custom reservations, duplicate-reference
  search, accurate totals beyond the first page and cursor precision.
- Public/private search and metadata isolation, name consent, revoked
  publication, scan-only behaviour, keyboard/accessibility checks and desktop/
  mobile reflow of all new forms and route selection.

Phase 6 first captures a private snapshot of the current development configuration,
database and seed identities. It deploys the tested new contract, updates all
ABI/runtime/network manifests, applies the matching schema and migrates/reseeds
development accounts/products as needed. Old metadata is not rewritten to
pretend it contained an ID/count. Retired deployment history stays associated
with its original contract, or is retained in the snapshot if a clean development
reset is used. A validator-ledger reset is not inherently required to deploy a
new contract.

Activation verifies actual Producer → two Distributors → Shop receipts and
partial removals, then compares chain, database, public tracking and business
inventory. Single-product regression is also exercised. Cleanup follows those
checks; final deployment receipts, docs and affected submodule commits are
published together. Phase 1 makes no live chain/database reset or service change.
