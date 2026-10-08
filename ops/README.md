# TraceForge Operations

Part of [TraceForge](https://github.com/aididalam/traceforge). Use the parent's
Docker setup instructions; configuration and persistent storage stay outside Git.

`deploy/` contains the application Compose definition and optional managed MySQL,
Pi memory, existing-chain network and node-bootstrap overlays. Blockchain and
joining-node Compose files live in `chain/docker/`. `ops/deploy/traceforge.sh`
runs the same commands exposed by the root Makefile, using Docker when host
Node.js is unavailable.

## Routine commands

```bash
make up
make status
make logs
make check
make backup
make restore-check
make chain-backup
```

`make check` verifies application readiness, indexer lag and advancing blocks.
`make backup` briefly pauses application services and writes an encrypted MySQL,
wallet, configuration and secrets archive; validators continue. `restore-check`
verifies archive authentication, table counts and actual file hashes in isolation.
`chain-backup` takes cold snapshots one validator at a time. Keep the backup key
and an archive copy on another host. `TRACEFORGE_BACKUP_DESTINATION` selects an
existing private directory on separately mounted storage.

## Full recovery and compatible updates

Recover into a dedicated data directory with empty database/wallet storage.
Copy the encrypted backup and original backup key, configure the original
chain/contract identity and matching release, then:

```bash
TRACEFORGE_RESTORE_EMPTY=true make restore BACKUP=/absolute/path/to/backup
make check
```

For a reviewed release compatible with the existing database schema:

```bash
TRACEFORGE_SCHEMA_COMPATIBLE=true make deploy VERSION=v0.1.0
make check
TRACEFORGE_SCHEMA_COMPATIBLE=true make rollback VERSION=YOUR_PREVIOUS_RELEASE
make check
```

`deploy` takes an encrypted backup, pulls the selected release and waits for
container health. Run `make check` for application and chain verification.
`rollback` starts the explicitly selected previous release.
Database changes requiring a separate migration plan must be handled before
using this compatibility assertion. Existing validator data and contract
identity are retained across application updates.

## Linux timers

```bash
./ops/deploy/install-timers.sh
systemctl list-timers 'traceforge-docker-*'
journalctl -u traceforge-docker-check.service -u traceforge-docker-backup.service
```

The installer creates systemd units with the deployment user's configuration;
health checks run every five minutes and daily encrypted backups run at 03:00
with jitter. Both use a maintenance lock. Failed units appear in the journal.
Set up separately mounted backup storage before relying on automatic copies.

## Publish a release

From a reviewed recursive checkout, authenticate Docker with your publisher
account and select a new immutable version:

```bash
VERSION=v0.1.0 TRACEFORGE_DOCKER_CONTEXT=default ./ops/deploy/publish.sh
```

The script publishes `api`, `indexer`, `ui`, `contract-tools` and `ops` images for
Linux AMD64 and ARM64. It refuses tags that already exist. For an interrupted
release, use `TRACEFORGE_COMPONENTS` to select only unpublished components.
The manual GitHub workflow uses the repository's `DOCKERHUB_TOKEN` secret.

`verify.mjs`, `verify-failures.mjs`, `verify-node-election.mjs` and
`verify-network-bootstrap.mjs` are acceptance tools for explicitly selected
isolated test deployments. ERP authentication and request examples are in the
[API reference](../api/API.md#erp-and-pos-integration).
