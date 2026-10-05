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
| `ui/` | Next.js public provenance viewer | `aididalam/traceforge-ui` (local; remote publication pending) |

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

The UI remote was unavailable when checked on 2026-10-05. UI work and several
root/API commits are local and intentionally unpublished. The configured UI
origin is `https://github.com/aididalam/traceforge-ui.git`; a fresh remote clone
will require those referenced commits to be published first.

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

The canonical product URL is `/track/<trackingId>` with one globally unique
public ID. Original tenant/entity links remain compatible. The registry
migration is prepared and temporarily tested, pending live DB/service
activation. See [single-ID tracking and activation](docs/public-tracking.md).

The first delivery supports a safe public trace page, lookup and timeline.
QR tools and authenticated operator workflows are subsequent phases. See the
[numbered roadmap](docs/roadmap.md) and [UI architecture](docs/ui-architecture.md)
for scope, acceptance and remaining work.
