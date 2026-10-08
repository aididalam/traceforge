# TraceForge easy and stable deployment plan

Prepared 2026-10-07; progress updated 2026-10-08. Configuration, ARM64 application
images, encrypted database/wallet restore and rolling validator snapshots have
passed isolated Docker acceptance. Runtime domain changes reuse the same image,
and the full product/batch/ERP/browser regression passed with 148 confirmed
transactions. Registry publication, Pi cutover, scheduled monitoring/backups
and host reboot verification remain in progress. See the
[deployment guide](docker-deployment.md) for the implemented commands.
The current product/batch and ERP business flows remain the baseline.

## Outcome and scope

A documented deployment should start from a recursive clone or a versioned
release, configuration and secrets. Operators should be able to start, inspect,
back up, update and recover it using Docker Compose and optional Make wrappers.
The same application images will support a subsequent Helm deployment.

Support an application deployment against existing MySQL/Besu services and a
self-contained reference installation. The current Pi chain remains usable.
Starting and updating existing installations preserves the contract, chain
identity, validator keys, database, product links and business wallets. Creating
a new chain and deploying its initial contract are explicit bootstrap tasks.

Single-server Compose is the first deployment target. Host-level high availability
requires separate validator hosts and an appropriate database/storage topology;
container restart policies alone do not supply it. Account recovery, administrator
screens, document uploads and ERP vendor plugins are separate product work.

## Phase 1 — Configuration and storage contract

Define one documented release configuration: domain, image versions, database,
RPC endpoints, chain ID, contract address, deployment block and runtime hash.
Validate it before startup, including the selected Docker context and target host.
Resolve component deployment defaults explicitly so that an installation cannot
silently index or write against an unintended contract.

Separate ordinary configuration from secrets. Support mounted secret files where
required; keep private material outside source control and images. Inventory the
existing database, wallets, off-chain metadata/evidence, chain configuration and
validator data before preparing a migration.

Define named/persistent storage, ownership and backup coverage for:

- MySQL, including identities, sessions, aliases, documents, journal and ERP queue.
- Business wallets, writable by the API and readable by the ERP worker with the
  same service identity; preserve directory 0700 and key file 0600 requirements.
- Each validator's independent key and data directory, plus genesis/configuration.
- Required off-chain files and backup artifacts.

Acceptance: configuration preflight fails clearly on missing settings, mismatched
chain/contract, missing wallets or unintended deployment target. Existing and new
installation procedures are documented separately.

## Phase 2 — Application images and container operation

Add multi-stage Dockerfiles and .dockerignore files in the API, indexer and UI
submodules. Package compiled runtime commands and required configuration/ABI
assets. Use pinned runtime versions, non-root service identities and graceful
termination. Build/test linux/amd64 and linux/arm64 images; verify image/platform
availability for MySQL, the proxy and the selected Besu release too.

Use the API image for separate API, ERP worker, publication-sync and migration
services. Use the indexer image for migration, backfill, projection and monitoring
commands. Include a supervised continuous indexing loop with a single active
projector by default; publication refresh must also run continuously.

Package Next.js as a server application. Bind container services to their private
interfaces and configure UI-to-API networking with explicit trusted upstream
settings. Preserve origin/CSRF checks and public/private response boundaries.
Keep public API calls same-origin and provide a runtime domain/QR configuration so
the same image can deploy under different domains. Validate proxy identity and
rate-limit behavior instead of trusting arbitrary forwarded headers.

Acceptance: images run without the host Node/npm installation, source mounts or
developer home paths. Restart/termination works, public reads and authenticated
writes work through the container gateway, and configuration changes do not
require rebuilding a domain-specific application image.

## Phase 3 — Database, shared sessions and recovery

Offer persistent MySQL 8.4 and external-MySQL configurations. Run existing indexer
migrations before API migrations in a dedicated one-shot migration task with
serialization. Application startup must wait for successful migrations; use
compiled migration commands in production images. Repeated deployment must be
idempotent. Database version changes require a separate verified upgrade path.

Replace the UI's process-local login map with a shared MySQL-backed server session
store, preserving opaque HttpOnly cookies, expiry and revocation. Avoid adding a
new cache service solely for sessions. Verify session credential protection and
cleanup. Start with bounded replica counts and explicit shared wallet access.

Add scheduled, owner-only, encrypted backups with configurable retention and an
off-host destination. Back up the whole required database and keys/files; the
blockchain cannot reconstruct business accounts, private metadata or short aliases.
Keep decryption material separately recoverable. Define the recovery-point and
recovery-time targets and measure them in a restore drill.

Restore first into an isolated environment. Reconcile restored journal/queue state
and projections with the actual chain before allowing writes, including the case
where transactions were mined after the database backup. Document uncertain-write
handling and recovery limits. Application rollback requires schema compatibility;
automatic database downgrades are not part of rollback.

Acceptance: an empty installation and an existing-data upgrade both succeed;
re-running migrations has no duplicate effects; login survives a UI restart;
backup restoration preserves accounts, links, metadata, wallets and stock totals.

## Phase 4 — Validator lifecycle and chain health

Extend the existing Besu Compose/scripts rather than replacing the chain identity.
Keep a permanent key/data volume per validator and a shared, verified genesis.
Make node endpoints/bootnodes configurable for single-host and separate-host
deployments. RPC stays private; expose only the required private P2P connectivity.
Remove the deployment's dependence on a Mac-owned SSH tunnel by establishing
server-owned private connectivity to external RPC endpoints.

Retain chain ID, validator-set, peer and advancing-block checks from the existing
health script. Distinguish healthy, degraded-but-producing and stalled conditions.
Add RPC endpoint failover that verifies chain identity and contract runtime before
using another endpoint. Containers being alive is insufficient for chain readiness.

Roll updates/backups through one validator at a time and verify catch-up/block
production before proceeding. With four QBFT validators, three must remain
participating; losing two stalls production. Preserve quorum when taking cold
data snapshots and test restoring a node and synchronizing it from healthy peers.
Never operate two live copies of the same validator identity. Gate Besu changes
on supported data compatibility and maintain version downgrade protection.

Acceptance: one validator failure leaves the chain producing and the application
able to use a healthy RPC; a restored node catches up with its original identity;
a rolling update preserves quorum. Full-host outage is handled by a documented
recovery procedure. Host-failure tolerance requires validators on independent
hosts, verified in that topology before making an availability claim.

## Phase 5 — Compose, HTTPS and operator commands

Add root deployment assets connecting HTTPS proxy, UI, API, ERP worker, indexer,
publication sync, migrations and optional MySQL/reference chain. Application and
chain may have separate Compose projects/lifecycles so an application update does
not restart validators. Support independent environment/project names.

Order startup using health checks and successful migration completion. Add retry
behavior for unavailable dependencies after startup, readiness/liveness checks,
worker heartbeat and queue/lag monitoring, bounded logs and configured resource
limits. TLS certificate data is persistent. Route browser traffic to Next and only
the intended ERP integration endpoints to the API; preserve operator gateway
isolation and configure per-client proxy rate limits deliberately.

Add a root Makefile as an optional wrapper around checked scripts/Compose:

| Planned command | Purpose |
| --- | --- |
| `make help` / `make doctor` | Instructions and target/configuration preflight |
| `make build` / `make up` | Build/start configured services and check readiness |
| `make bootstrap` | Explicit first-install workflow; new-chain setup is separate |
| `make status` / `make logs` / `make check` | Inspect health, logs, lag and queue |
| `make backup` / `make restore-check` | Backup and isolated restore verification |
| `make deploy VERSION=...` | Verified upgrade, migrations and application rollout |
| `make rollback VERSION=...` | Compatible application rollback and health check |
| `make chain-check` / `make chain-upgrade VERSION=...` | Chain validation/rolling upgrade |
| `make down` | Stop services while retaining persistent data |

Provide direct Docker/script equivalents so Make is convenient, not mandatory.
Normal start/deploy/stop commands retain volumes and existing chain/contract data.

Acceptance: a documented clean Linux host can deploy without developer-specific
paths. HTTPS, QR domain, ERP routing, host reboot and health reporting work. Failed
migrations/readiness checks stop the rollout with useful, secret-free diagnostics.

## Phase 6 — Deployment verification, release and activation

Test first with a dedicated Docker target/project and disposable data, checking
the Docker context before mutations because the developer context points to Pi.
Run relevant existing gates and deployment-specific acceptance:

- Empty-database bootstrap and existing-data upgrade; migration retry/failure.
- Browser signup/login, metadata, tracking/QR and single/batch custody/removals.
- ERP queue/retry/idempotency across worker/API termination and dependency outages.
- MySQL restart, UI restart, indexer/publication-sync restart and host reboot.
- One validator failure/RPC failover, catch-up and measured projection recovery.
- Off-host backup restoration into isolated storage and compatible app rollback.
- Concurrent users through HTTPS/proxy and bounded ERP processing load.

Publish versioned multi-platform images with pinned release metadata and CI checks.
Record tested commits, migration versions and measured recovery/load results.
Rehearse cutover with backups, stop/drain the old writers, switch to supervised
containers and verify existing products/accounts/links and a bounded real operation
flow. Keep the verified previous release and recovery artifacts available.

Acceptance: evidence covers both first deployment and safe update/recovery. The
selected hosted deployment runs independently of development terminals and
returns to a verified state after restart/reboot without duplicate stock changes.

## Phase 7 — Kubernetes packaging of the verified release

Use the same images in a Helm chart with settings for domain/TLS, external or
internal database/RPC, existing secret references and persistent storage. Run
migrations as a serialized Job and gate the rollout on completion. Configure
probes, graceful termination, resource limits and restricted network access.

Default to one indexer/projector and bounded writer replicas until shared wallet
storage and concurrent recovery are verified. Use persistent validator identities
and quorum-aware startup/rolling maintenance when packaging an internal reference
chain; initial bootstrap must not wait for quorum before starting the other nodes.
Use host separation for a production validator topology, and explicit database
and storage availability arrangements for a multi-host deployment.

Acceptance: fresh Helm installation, version upgrade, pod rescheduling, migration
failure, session continuity, persistent storage access and queue recovery pass in
a real test cluster. Merely rendering YAML is not Kubernetes deployment evidence.

## Reference basis

- Current implementation/status: [platform roadmap](roadmap.md),
  [operations baseline](../ops/README.md), [ERP integration](erp-integration.md).
- [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).
- [MySQL backup and recovery](https://dev.mysql.com/doc/refman/8.4/en/backup-and-recovery.html).
- [Besu QBFT quorum](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft)
  and [backup/restore](https://docs.besu-eth.org/private-networks/how-to/backup).
- [Helm charts](https://helm.sh/docs/topics/charts/),
  [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
  and [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/).
