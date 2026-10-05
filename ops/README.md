# TraceForge Operations Baseline

These files are reference deployment assets for a Linux host.

Reference layout:

- repository: /opt/traceforge
- service user: traceforge
- API environment: /etc/traceforge/api.env
- indexer environment: /etc/traceforge/indexer.env
- API: 127.0.0.1:3000
- Besu RPC: 127.0.0.1:8545

Do not put passwords, tokens, signer keys, or serialized signed
transactions in this repository.

## 1. Pre-deployment verification

From /opt/traceforge/api:

    npm ci
    npm run verify:deployment-readiness

From /opt/traceforge/indexer:

    npm ci
    npm run verify:deployment-readiness

From /opt/traceforge/chain:

    ./scripts/health-check.sh

The normal deployment baseline keeps blockchain broadcasting disabled.

## 2. Production build

API:

    cd /opt/traceforge/api
    npm run build

Indexer:

    cd /opt/traceforge/indexer
    npm run build

## 3. Environment files

Store runtime configuration outside Git:

    /etc/traceforge/api.env
    /etc/traceforge/indexer.env

Recommended permissions:

    sudo chown root:traceforge /etc/traceforge/api.env
    sudo chown root:traceforge /etc/traceforge/indexer.env
    sudo chmod 640 /etc/traceforge/api.env
    sudo chmod 640 /etc/traceforge/indexer.env

The API environment should normally contain:

    API_HOST
    API_PORT
    MYSQL_HOST
    MYSQL_PORT
    MYSQL_DATABASE
    MYSQL_USER
    MYSQL_PASSWORD
    TRACEFORGE_CHAIN_ID
    TRACEFORGE_CONTRACT_ADDRESS
    TRACEFORGE_RPC_URL
    TRACEFORGE_RUNTIME_BYTECODE_HASH
    TRACEFORGE_SIGNER_ADDRESS
    TRACEFORGE_SIGNER_KEY_FILE
    TRACEFORGE_BROADCAST_ENABLED

The indexer environment should contain:

    TRACEFORGE_RPC_URL
    MYSQL_HOST
    MYSQL_PORT
    MYSQL_DATABASE
    MYSQL_USER
    MYSQL_PASSWORD
    INDEXER_CHUNK_SIZE
    INDEXER_CONFIRMATIONS

Never print secret values while troubleshooting.

## 4. systemd installation

First confirm the production Node paths:

    command -v node
    command -v npm

The reference units expect:

    /usr/bin/node
    /usr/bin/npm

If the host uses different paths, edit the unit templates before
installation.

Install:

    sudo cp ops/systemd/traceforge-api.service /etc/systemd/system/
    sudo cp ops/systemd/traceforge-indexer.service /etc/systemd/system/
    sudo cp ops/systemd/traceforge-indexer.timer /etc/systemd/system/

Verify on Linux:

    sudo systemd-analyze verify /etc/systemd/system/traceforge-api.service
    sudo systemd-analyze verify /etc/systemd/system/traceforge-indexer.service
    sudo systemd-analyze verify /etc/systemd/system/traceforge-indexer.timer

Reload and start:

    sudo systemctl daemon-reload
    sudo systemctl enable --now traceforge-api.service
    sudo systemctl enable --now traceforge-indexer.timer

## 5. Service verification

API:

    systemctl status traceforge-api.service
    curl -fsS http://127.0.0.1:3000/health
    curl -fsS http://127.0.0.1:3000/ready

Indexer:

    systemctl status traceforge-indexer.timer
    systemctl list-timers traceforge-indexer.timer

Manual catch-up:

    sudo systemctl start traceforge-indexer.service

Then:

    cd /opt/traceforge/indexer
    npm run status
    npm run read-model:status
    npm run documents:status

Chain:

    cd /opt/traceforge/chain
    ./scripts/health-check.sh

## 6. Logs

API:

    journalctl -u traceforge-api.service -n 200 --no-pager

Indexer:

    journalctl -u traceforge-indexer.service -n 200 --no-pager

Live API logs:

    journalctl -u traceforge-api.service -f

## 7. Safe API restart

Before routine deployment:

    cd /opt/traceforge/api
    npm run verify:deployment-readiness
    npm run build

Then:

    sudo systemctl restart traceforge-api.service

Verify:

    curl -fsS http://127.0.0.1:3000/health
    curl -fsS http://127.0.0.1:3000/ready

Routine deployment should keep TRACEFORGE_BROADCAST_ENABLED=false.

Enabling blockchain writes is an explicit operational action and is not
part of a normal restart.

## 8. Ambiguous blockchain write recovery

If a blockchain request has an ambiguous network result:

- do not invent another Idempotency-Key;
- do not submit an equivalent request with a new key;
- retry only the exact original request with the exact same
  Idempotency-Key;
- inspect the write journal before taking any destructive action.

Check:

    cd /opt/traceforge/api
    npm run verify:write-journal-readiness

## 9. Database backup and restore drill

The verifier creates a real MySQL dump and restores it into an isolated
temporary database. It does not overwrite the live traceforge database.

Run:

    cd /opt/traceforge/api
    npm run verify:mysql-backup-restore

Expected ending:

    MYSQL BACKUP RESTORE VERIFIED.
    Live database was not overwritten.
    Backup file permissions are owner-only.

Backups are written below the traceforge service user home:

    ~/.traceforge/backups/mysql

Backup retention should be reviewed periodically.

## 10. Recovery

If API readiness fails:

    systemctl status traceforge-api.service
    journalctl -u traceforge-api.service -n 200 --no-pager

Check MySQL connectivity and then rerun:

    cd /opt/traceforge/api
    npm run verify:deployment-readiness

If the indexer falls behind:

    sudo systemctl start traceforge-indexer.service

Then inspect:

    cd /opt/traceforge/indexer
    npm run status
    npm run read-model:status

If Besu health fails:

    cd /opt/traceforge/chain
    ./scripts/health-check.sh

Do not redeploy the TraceForge contract as a recovery shortcut.

## 11. Code rollback

Checkout a previously verified root repository commit:

    cd /opt/traceforge
    git checkout KNOWN_GOOD_ROOT_COMMIT
    git submodule update --init --recursive

Rebuild:

    cd /opt/traceforge/api
    npm ci
    npm run build

    cd /opt/traceforge/indexer
    npm ci
    npm run build

Restart the API and run an indexer catch-up.

Database schema downgrades are not automatic. Never reverse migrations
without a separately reviewed recovery plan.

