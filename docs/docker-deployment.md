# Docker deployment

Run deployment commands **on the Docker host**, from a recursive clone of the
parent repository. Docker Engine and Compose are required; Node and Make are
optional. The wrapper uses the versioned `traceforge-ops` image when Node 22+
is unavailable. Kubernetes/Helm are outside this delivery.

## Configuration and domain

```sh
git clone --recurse-submodules https://github.com/aididalam/traceforge.git
cd traceforge
mkdir -m 700 .traceforge-deploy
cp deploy/deployment.env.example .traceforge-deploy/deployment.env
chmod 600 .traceforge-deploy/deployment.env
```

Edit that private file before starting. Set the Docker context, absolute data
directory, runtime UID/GID (`id -u`, `id -g`), database mode and exact existing
chain identity. Pi uses the local `default` context. A Mac's SSH Docker context
does not make Mac file paths available as Pi bind mounts.

`TRACEFORGE_PROFILE=pi` selects bounded application heaps/memory for the 4 GB
Pi. Use `-Xmx128m` and a 384 MiB limit per colocated FOREST validator. Verify the
host's Docker memory-limit support; the Pi profile refuses disabled memory
cgroups. Larger workloads require a larger host/profile and measured capacity.

The domain is **runtime configuration**, shared by the proxy, login checks,
copied links and product QR generation:

```dotenv
# Initial Pi access through an SSH tunnel; no domain required.
TRACEFORGE_SITE_ORIGIN=http://127.0.0.1:3101
TRACEFORGE_HTTP_BIND=127.0.0.1
TRACEFORGE_HTTP_PORT=3101
TRACEFORGE_HTTPS_PORT=3443
```

Later, with DNS pointing to the deployment and public ports 80/443 available:

```dotenv
TRACEFORGE_SITE_ORIGIN=https://trace.your-domain.com
TRACEFORGE_HTTP_BIND=0.0.0.0
TRACEFORGE_HTTP_PORT=80
TRACEFORGE_HTTPS_PORT=443
```

Run `make up` after editing. Existing images are reused; **changing the domain
does not require an image rebuild, a new contract or new product identifiers**.
Compose recreates services whose configuration changed; a bare `docker compose
restart` does not load new environment values. Open the new canonical origin
when signing in. Browser cookies belong to their domain, so a domain change can
require signing in again.

Printed QR codes contain the old URL. Keep control of the old domain and arrange
an HTTPS redirect preserving `/s/...` and `/track/...` paths. Config changes
cannot rewrite labels that have already been printed. Short/full identifiers
remain unchanged and can still be entered directly at the new site.

The site origin accepts HTTPS or local loopback HTTP, with no path, query or
credentials. The previous `TRACEFORGE_OPERATOR_SITE_ORIGIN` remains an alias
for standalone UI deployments; use one canonical setting. The UI reads it after
Next.js [`connection()`](https://nextjs.org/docs/app/api-reference/functions/connection),
so the server supplies runtime configuration to the browser instead of embedding
a `NEXT_PUBLIC_*` domain into the build. Caddy handles certificate issuance and
renewal when the [automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https)
are satisfied. Public DNS/TLS activation is separate from the initial SSH setup.

Other deployment variables include ports, database/RPC endpoints, contract
address/block/hash, image namespace/version, data directory and sync intervals.
Passwords and encryption/proxy keys use owner-only files under the private data
directory. They stay outside Git and image layers. Keep the backup encryption
key independently recoverable on another host.

## Existing chain and first application startup

Keep the original genesis, validator identities, chain data and deployed
contract. For colocated Besu, attach to its existing network and use its private
Docker DNS names:

```dotenv
TRACEFORGE_CHAIN_MODE=external
TRACEFORGE_CHAIN_NETWORK=traceforge-network
TRACEFORGE_RPC_URL=http://traceforge-validator1:8545
# Enable private RPC on the other validators before using these fallbacks.
TRACEFORGE_RPC_FALLBACK_URLS=http://traceforge-validator2:8545,http://traceforge-validator3:8545,http://traceforge-validator4:8545
```

Initialize private storage and generated secrets, preserving existing files:

```sh
make init
make doctor
make up
make check
make status
```

The script equivalents are `./ops/deploy/traceforge.sh init`, `doctor`, `up`, etc.
Use `TRACEFORGE_ENV_FILE=/absolute/private/deployment.env` for another config.
Before migrating an existing application, back up and drain/stop its writers;
import the complete database and copy its business wallet keys with permissions
700/600. Preserve off-chain documents, accounts, mappings, short codes, write
journal and ERP queue. A chain projection alone cannot recreate metadata or
credentials. Existing MySQL can instead use `TRACEFORGE_DATABASE_MODE=external`
with a container-reachable host and its original password file.

The app stack contains MySQL, serialized indexer/API migrations, API, ERP worker,
indexer/projector, publication sync, Next.js and Caddy. Only the proxy has browser
ports. `/integration/v1/*` reaches the bearer-authenticated ERP API; browser
operator requests use Next's cookie/Origin gateway. Private API/RPC/database
ports stay within Docker networks. Services have restart policies, log rotation,
resource limits and health checks. Readiness checks database/schema and verified
chain/contract access; stalled block production becomes unhealthy.

Docker must start at boot. On Linux, verify `systemctl is-enabled docker` and
enable it if needed. `make down` removes application containers/networks and
retains bind-mounted storage. Never delete the data directory to perform an
ordinary update.

## Scheduled operation and image releases

On the Linux host, run as the deployment owner:

```sh
./ops/deploy/install-timers.sh
systemctl list-timers 'traceforge-docker-*'
journalctl -u traceforge-docker-check.service -u traceforge-docker-backup.service
```

The installer uses sudo for systemd installation. Daily encrypted backups run
at 03:00 with up to 15 minutes of jitter; health checks run every five minutes.
Both share a maintenance lock. A backup briefly pauses application services;
validators continue. Failed checks appear as failed units in the system journal.
Set `TRACEFORGE_BACKUP_DESTINATION` to a private directory on mounted off-host
storage for an automatic second copy. A second directory on the same SD card
does not protect against card loss. Keep the backup key on another host too.

Publish a new version from a clean, reviewed recursive checkout:

```sh
VERSION=deployment-20261008 TRACEFORGE_DOCKER_CONTEXT=default ./ops/deploy/publish.sh
```

This builds API, indexer, UI, contract tools and operations helper for
`linux/amd64` and `linux/arm64` and pushes them to `aididalam/traceforge-*`.
The script refuses an existing tag. After a partial failure, select only
unpublished components with `TRACEFORGE_COMPONENTS="ui contract-tools ops"`.
The manual GitHub Actions workflow uses the repository secret `DOCKERHUB_TOKEN`;
it does not publish on ordinary pushes. Multi-platform builds follow the
[Docker CI guidance](https://docs.docker.com/build/ci/github-actions/multi-platform/).

## Explicit new chain bootstrap

Use a separate, empty data directory and `TRACEFORGE_CHAIN_MODE=local` for a
fresh installation. Set RPC to `http://validator1:8545` and fallbacks to
validators 2–4. Bootstrap is explicit:

```sh
make init
make chain-init
make chain-up
make contract-init
make up
make check
make chain-check
```

`chain-init` refuses an existing chain directory. `contract-init` persists its
deployment attempt before broadcast and records/reuses the deployed contract;
application startup does not deploy contracts. After creating a new chain,
`contract-init` writes its actual address/block/runtime hash into the config.
Never use these bootstrap commands to replace the current Pi chain.

Preserve `TRACEFORGE_BESU_STORAGE_FORMAT`: the reference fresh network uses
BONSAI; the existing Pi chain uses FOREST. Changing a profile or image must not
silently switch the database format. A four-validator QBFT network continues
with one stopped validator; two unavailable validators halt consensus. Four
containers on one Pi do not provide availability through a Pi outage.

## Backup and recovery

```sh
make backup
make restore-check
# Choose a specific encrypted backup under the deployment's data directory:
make restore-check BACKUP=/srv/traceforge/backups/2026-10-08T12-00-00.000Z
make chain-backup
```

Application backup briefly stops the services that write or serve application
state, takes a consistent MySQL dump plus wallet/secret/TLS/release files, then
starts only services that were previously running. Archives use authenticated
AES-256-GCM encryption. The manifest records table counts, file hashes and chain/
release identity. Restore checks authenticate before SQL import, restore into
an isolated temporary database, compare all table counts, extract actual wallet/
configuration files and compare hashes. Temporary databases/files are removed.

The default retention is 14 days. Set `TRACEFORGE_BACKUP_DESTINATION` to an
existing private directory on separately mounted storage for an additional
encrypted copy. A second directory on the same SD card is not an off-host
backup. Copy the backup key separately; encrypted archives cannot recover it.

`chain-backup` is for the managed reference chain. It stops/snapshots/restarts
one validator at a time and verifies all nodes caught up before the next stop.
External networks use their original chain lifecycle/backup procedure. Chain
snapshots and application backups serve different purposes; retain both.

For full application recovery, stop/remove the old application's containers,
retain its old data directory, and prepare **empty** database/wallet directories
in a new private data directory. Copy the encrypted backup and original backup
key there. Preserve the project/database/chain/contract identity and secret
file layout; adjust host paths/UID/GID/site origin for the recovery host. Then:

```sh
TRACEFORGE_RESTORE_EMPTY=true make restore BACKUP=/srv/traceforge-recovered/backups/<timestamp>
make check
make chain-check
```

Restore refuses existing containers or nonempty database/wallet storage. It
verifies the snapshot first, restores keys and MySQL, then runs migrations and
starts the app. It retains the existing chain. External MySQL restore uses the
database administrator's recovery procedure. Metadata or credentials created
after the most recent backup require a newer backup; blockchain hashes alone
cannot reconstruct them.

## Updates and rollback

```sh
make deploy VERSION=<new-published-version>
```

This backs up the currently configured release, pulls the requested application
images, stops writers, runs serialized migrations and starts/checks the new
services. The version is saved to the config only after successful startup.
Migration/startup failure requires reviewing service logs and the saved backup;
do not restart an old writer against an unverified new schema.

For a previous release whose compatibility with the current schema was checked:

```sh
TRACEFORGE_SCHEMA_COMPATIBLE=true make rollback VERSION=<previous-version>
```

Rollback changes app images without running down migrations. An incompatible
schema needs the verified snapshot recovery procedure. Validator upgrades remain
a separate, one-node-at-a-time operation (`make chain-upgrade` for the managed
reference network). Do not recreate all validators during an application update.

## Verification

```sh
make test-config NODE=node
# Explicitly isolated local test project ending in -test, never the existing Pi:
TRACEFORGE_ACCEPTANCE=true TRACEFORGE_ENV_FILE=.traceforge-deploy/test/deployment.env node ops/deploy/verify.mjs
```

The acceptance script requires the UI's Playwright dependencies/browser. It
registers independent businesses, creates/receives single and batch stock,
decodes a browser-generated QR, verifies session survival through UI restart,
queues a checkout with the worker stopped, restarts DB/API, resumes the worker,
and checks duplicate checkout does not remove stock again. The same image is
also run with three site origins; browser QR links and Origin checks follow the
runtime config. Test-only project and local-chain guards prevent these writes
from reaching the existing Pi deployment.
