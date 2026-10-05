# Public product details and dated supply history

Updated 2026-10-05. The consumer page displays the product name and shared
product fields first, the current status/business next, then dated supply
history. Technical identifiers remain in expandable reference sections.

## Public API additions

The existing entity and history endpoints retain their publication gates and
add these explicit display fields:

- `entity.productInfo`: nullable `{ name, description, fields: [{ label, value }] }`.
- `entity.currentHolder`: nullable `{ id, name, type }`. A known business ID can
  have null name/type when its display details have not been shared.
- `event.occurredAt`: nullable decimal Unix seconds extracted from the event's
  actual timestamp argument. No event date is inferred from its block number.
- `event.organization`: nullable `{ id, name, type }` for the recorded business.
- `event.transfer`: nullable `{ from, to }`, each a nullable business object.

Timestamp arguments are selected by event name: `createdAt` for creation,
`timestamp` for a trace, `proposedAt`/`acceptedAt`/`cancelledAt` for transfers,
`updatedAt` for link updates and `closedAt` for closure. Accepted transfers are
attributed to the receiver; proposals to the sender. An administrator's
cancellation does not invent a business actor. A proposal does not change the
current holder. The current holder always comes from the indexed projection.

The UI shows date and time with an explicit UTC label and a semantic `time`
element. Missing/out-of-range dates show “Date unavailable”; missing business
names show “Business name not shared”. Old API payloads remain readable with
null defaults for the additions. New response objects remain strict allowlists.

## Separately reviewed public details

Migration `006_public_entity_presentations.sql` prepares a table for an
explicitly approved display snapshot, scoped to one tenant/product. Publishing
the product alone does not publish its complete metadata or evidence document.
Public reads never query `offchain_documents` or the authenticated document API.
The operator selects the product fields and business names in a public file.
Fields are industry-independent label/value pairs; there are bounded lengths,
field/business counts, strict object keys and no rendered HTML.

A file has the following shape; replace the synthetic references with current
indexed references before use:

```json
{
  "metadataHash": "0x4444444444444444444444444444444444444444444444444444444444444444",
  "productInfo": {
    "name": "Sample batch",
    "description": null,
    "fields": [
      { "label": "Units", "value": "100" },
      { "label": "Packaging", "value": "Packed" }
    ]
  },
  "organizations": [
    {
      "id": "0x2222222222222222222222222222222222222222222222222222222222222222",
      "metadataHash": "0x6666666666666666666666666666666666666666666666666666666666666666",
      "name": "Sample distributor",
      "type": "Distributor"
    }
  ]
}
```

The operator CLI requires an explicit public-sharing flag:

```bash
npm run public:details -- --tenant <tenantId> --entity <entityId> --file <reviewed-public-file.json> --confirm-public
npm run public:details -- --tenant <tenantId> --entity <entityId> --clear
```

Sharing requires an existing published product, the current product metadata
reference, and matching organization metadata references/membership in the
same workspace. All writes happen in one transaction. The CLI does not publish
an entity, issue a Tracking ID, alter original documents or send chain writes.
Clearing affects only this product's display snapshot.

If the product metadata reference changes, old product details are suppressed
until reviewed again. Changed or out-of-workspace organization references
suppress that business's name/type. Historical events retain their recorded
IDs; names are separately approved display labels, not historical name proofs.
The product snapshot is a reviewed excerpt associated with the metadata
reference; the excerpt is not itself hashed or independently authenticated by
the original complete-document hash. Recorded claims remain business claims.

The entity publication gate protects these fields on both endpoints. Unknown,
unpublished and cross-workspace products remain the same 404. Relationship
events still require both product endpoints to be published. Complete documents,
raw event arguments, wallet addresses, roles and credentials remain excluded.

## Verification and activation

```bash
npm run verify:production-build
npm run verify:public-discovery
npm run verify:public-presentation
TRACEFORGE_BROADCAST_ENABLED=false npm run test:public-presentation
```

The offline gate runs in root CI and tests display validation, publication
isolation, approved names, timestamp validation, stale-reference suppression,
writer guards and CLI flag negatives. The local MySQL test uses temporary model,
event and presentation tables, plus uncommitted publication rows with rollback.
It covers all nine timestamp mappings, transfer attribution, exact cursors,
idempotent sharing, clearing, privacy and unchanged live data/migration state.

UI checks passed: typecheck, production build, 18 unit tests and 42 browser
checks across desktop/mobile Chromium, including axe, the real Next gateway,
plain-text product details, names/dates, reference disclosure and 320px reflow.

Migrations 005 and 006 remain unapplied to the live database under the current
temporary-write-only restriction. Apply them and activate the updated API in a
separately authorized service change, then share a reviewed public file.
Without migration 006, the updated API still returns dated history with null
product details/business names. Preview display snapshots are temporary and
are dropped on disconnect; no permanent publication is made by a preview.

Tracking ID and URL resolution are unchanged by this addition.
