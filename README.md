# TraceForge

**TraceForge** is an open-source, multi-tenant blockchain traceability platform for dynamic product supply chains.

It is designed to support different companies, products, organizations, workflows, metadata schemas, lifecycle states, and trace events while sharing a common blockchain infrastructure.

## Components

| Submodule | Role | Repository |
| --- | --- | --- |
| `chain/` | Private Hyperledger Besu QBFT infrastructure | [traceforge-chain](https://github.com/aididalam/traceforge-chain) |
| `contracts/` | Generic multi-tenant traceability and authorization | [traceforge-contracts](https://github.com/aididalam/traceforge-contracts) |
| `indexer/` | Contract-event indexing into MySQL projections | [traceforge-indexer](https://github.com/aididalam/traceforge-indexer) |
| `api/` | Authenticated operations and opt-in public provenance | [traceforge-api](https://github.com/aididalam/traceforge-api) |
| `ui/` | Next.js product tracking interface | [traceforge-ui](https://github.com/aididalam/traceforge-ui) |

## Repository Structure

```text
traceforge/
├── api/         → TraceForge API submodule
├── chain/       → TraceForge Chain submodule
├── contracts/   → TraceForge Contracts submodule
├── indexer/     → TraceForge Indexer submodule
├── ui/          → TraceForge UI submodule (Next.js)
├── docs/        → Architecture and delivery roadmap
├── ops/         → Operational and monitoring assets
└── .github/     → Secret-free verification workflow
```

## Clone

Clone TraceForge together with all submodules:

```bash
git clone --recurse-submodules https://github.com/aididalam/traceforge.git
```

If the repository has already been cloned:

```bash
git submodule update --init --recursive
```

All five components are separate repositories registered in [.gitmodules](.gitmodules).
This parent repository pins their versions. Each component README links back
to TraceForge, and the table above links to every component repository.

## Public UI

With Node 22 and dependencies installed in `ui/`:

```bash
cd ui
npm ci
NEXT_TELEMETRY_DISABLED=1 npm run dev
```

Open `http://127.0.0.1:3100`. The gateway uses the existing public API at
`http://127.0.0.1:3000` by default in development. The API must run separately;
entities must be explicitly published to appear. UI startup makes no database
or blockchain changes. See [UI setup and verification](ui/README.md).

Product links can use `/s/<12-character-code>` for sharing; the full
`/track/<trackingId>` and original tenant/entity links remain compatible.
The homepage's single lookup field accepts a short/full Tracking ID or searches
the product/batch ID printed by a business.
Registry and dashboard migrations are applied to the fresh local database. See [single-ID tracking](docs/public-tracking.md) and
[short links and activation](docs/public-short-links.md).

The public page shows shared product information, the current business holder,
and dated supply history. Approved names replace technical IDs in the main view;
IDs remain in expandable references. See [public display details](docs/public-product-details.md)
for the reviewed-field publication policy.

The [business dashboard](docs/operator-dashboard.md) supports independent signup,
product creation, QR generation/scanning, direct receipt and holder-only close.
See the [delivery roadmap](docs/roadmap.md), [UI architecture](docs/ui-architecture.md)
and [fresh-chain validation](docs/direct-claim-upgrade.md).

The next upgrade is specified in the [product ID and batch quantity plan](docs/batch-quantity-plan.md):
business references, quantities, multiple supply routes, partial removals and
search. Phase 1 defines the design, [phase 2 implements/tests the contract](docs/batch-contract-phase2.md),
[phase 3 implements/tests the indexer and API](docs/batch-api-phase3.md),
[phase 4 implements/tests the UI](docs/batch-ui-phase4.md), and
[phase 5 validates the assembled system](docs/batch-integration-phase5.md) with
131 confirmed transactions and real desktop/mobile browser flows.
The current deployment still uses whole-product receipt/removal until the
tested upgrade is activated on Pi in Phase 6.

## Independent businesses and product receipt

Businesses register independently, add products in their own workspace and receive products from any producer after physical handover. A scan displays the product; a separate confirmation records receipt and changes the holder. Inventory spans supply chains. The current holder can close tracking as Sold, Lost, Damaged or Disposed. Closed records stay readable and cannot be received again.

The Next.js business UI provides signup, product creation, QR download/camera scanning, receipt confirmation and close actions. Public tracking remains an opt-in view with one Tracking ID or short code, product details, named holders and dated history. See [business dashboard flow](docs/operator-dashboard.md).
