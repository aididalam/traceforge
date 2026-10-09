# TraceForge Operations

Part of [TraceForge](https://github.com/aididalam/traceforge). Use the parent's
Docker setup instructions; configuration and persistent storage stay outside Git.

`deploy/` contains the application Compose definition and optional managed MySQL,
Pi memory, existing-chain network and node-bootstrap overlays. Blockchain and
joining-node Compose files live in `chain/docker/`. `ops/deploy/traceforge.sh`
runs the same commands exposed by the root Makefile, using Docker when host
Node.js is unavailable.

## Public networks

Follow the parent's [public EVM installation](../README.md#public-evm-network).
`make public-setup`, `public-deploy`, `public-up` and `public-check` select
`.traceforge-deploy/public.env`. No private validator commands run in this mode.
`public-wallet` displays the deployer address; `public-wallets` lists business
wallet addresses and native balances. Funding is explicit:

```bash
make public-fund ADDRESS=0x... AMOUNT=0.01 FUNDING_ID=business-funding-0001
TRACEFORGE_ENV_FILE=.traceforge-deploy/public.env make backup
TRACEFORGE_ENV_FILE=.traceforge-deploy/public.env make restore-check
```

The amount is in the network's native currency. An ID identifies one payment;
repeat its exact command while pending. Signed transactions are saved before
submission; fee replacements preserve the nonce and payload. Fee caps apply
to deployer and business transactions. Keep the deployer key, business wallet
keys, funding journals and database in backups. Never reuse a data directory
between private/public chains.

Public writes and indexing require RPC `finalized` block support and canonical
block hashes. Transactions before finality remain pending. A changed finalized
checkpoint stops indexing: investigate the provider/chain and rebuild the
projection from the deployment block before resuming. This implementation does
not bridge networks or connect an external browser wallet.

With Node 22 and component dependencies installed, verify public-network policy
against disposable paid-gas EVMs:

```bash
npm --prefix contracts run compile
npm --prefix contracts run test:public
npm --prefix api run test:transaction-policy
npm --prefix indexer run test:finality
```

These tests cover Ethereum/Polygon/BNB chain identities, funding idempotency,
fee caps and canonical finality. They do not send transactions to public networks.

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
TRACEFORGE_SCHEMA_COMPATIBLE=true make deploy VERSION=v0.2.0
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

## Connect another node or validator

On the managed network host, configure `TRACEFORGE_P2P_ENABLED=true`,
`TRACEFORGE_P2P_BIND` and `TRACEFORGE_P2P_ADVERTISE_HOST` with its reachable LAN/VPN
IP. Run `make chain-up` and `make chain-export`. Allow peer TCP/UDP ports
30303–30306 between the machines.

On the joining machine, recursively clone this repository and create an
owner-only `.traceforge-deploy` directory, then:

```bash
cp chain/config/node.env.example .traceforge-deploy/node.env
chmod 600 .traceforge-deploy/node.env
```

Set its own absolute data path, reachable LAN/VPN IP, matching chain ID and image
version. Allow the joining node's TCP/UDP P2P port (default 30307) between hosts.
Securely copy the network host's `TRACEFORGE_DATA_DIR/join-network.json`
to `.traceforge-deploy/join-network.json`. Alternatively enable
`TRACEFORGE_NETWORK_BOOTSTRAP_ENABLED=true` on the network host, run `make init`,
`make chain-export` and `make up`, then give the joining operator only the separate
bootstrap token. Configure its HTTPS `TRACEFORGE_JOIN_BUNDLE_URL` and private
`TRACEFORGE_JOIN_TOKEN_FILE`; run `make node-fetch` before initialization.

```bash
make node-init
make node-up
make node-check
make node-info
```

Retry the check while initial synchronization completes. The node generates its
own persistent key and can follow the chain immediately after synchronization.
To elect it as a validator, each current validator operator votes through their
private RPC:

```bash
make validator-vote ADDRESS=0x_NEW_NODE_ADDRESS ADD=true RPC=http://validator1:8545
make validator-status
```

More than half of the current validators must vote; a four-validator network
needs three matching votes. Confirm election in `validator-status`. Removal uses
`ADD=false` and the same majority rule. Keep RPC private and retain node storage.

## Publish a release

From a reviewed recursive checkout, authenticate Docker with your publisher
account and select a new immutable version:

```bash
VERSION=YOUR_NEW_RELEASE TRACEFORGE_DOCKER_CONTEXT=default ./ops/deploy/publish.sh
```

The script publishes `api`, `indexer`, `ui`, `contract-tools` and `ops` images for
Linux AMD64 and ARM64. It refuses tags that already exist. For an interrupted
release, use `TRACEFORGE_COMPONENTS` to select only unpublished components.
The manual GitHub workflow uses the repository's `DOCKERHUB_TOKEN` secret.

`verify.mjs`, `verify-failures.mjs`, `verify-node-election.mjs` and
`verify-network-bootstrap.mjs` are acceptance tools for explicitly selected
isolated test deployments. ERP authentication and request examples are in the
[API reference](../api/API.md#erp-and-pos-integration).
