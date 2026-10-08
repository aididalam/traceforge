#!/usr/bin/env bash
# Run on the Linux Docker host as the deployment owner; sudo installs units only.
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
task_config="${TRACEFORGE_ENV_FILE:-$task_root/.traceforge-deploy/deployment.env}"
task_config="$(realpath "$task_config")"
task_owner="$(id -un)"
[[ "$(uname)" == Linux && "$task_owner" != root ]] || { echo 'Run as the Linux deployment owner.' >&2; exit 1; }
[[ "$task_root" =~ ^/[a-zA-Z0-9_./-]+$ && "$task_config" =~ ^/[a-zA-Z0-9_./-]+$ && "$task_owner" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Systemd installation requires paths without spaces or special characters.' >&2; exit 1; }
[[ "$(stat -c %a "$task_config")" == 600 ]] || { echo 'Configuration must have mode 600.' >&2; exit 1; }
task_directory="$(mktemp -d)"
trap 'rm -rf "$task_directory"' EXIT
for task_command in backup check; do
cat > "$task_directory/traceforge-docker-$task_command.service" <<EOF
[Unit]
Description=TraceForge Docker $task_command
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$task_owner
WorkingDirectory=$task_root
Environment=TRACEFORGE_ENV_FILE=$task_config
UMask=0077
ExecStart=/usr/bin/flock -w 900 $task_root/.traceforge-deploy/maintenance.lock $task_root/ops/deploy/traceforge.sh $task_command
TimeoutStartSec=1800
EOF
done
cat > "$task_directory/traceforge-docker-backup.timer" <<'EOF'
[Unit]
Description=Daily encrypted TraceForge backup
[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
EOF
cat > "$task_directory/traceforge-docker-check.timer" <<'EOF'
[Unit]
Description=TraceForge health check every five minutes
[Timer]
OnBootSec=3m
OnUnitActiveSec=5m
Persistent=true
[Install]
WantedBy=timers.target
EOF
mkdir -p "$task_root/.traceforge-deploy"
sudo install -m 644 "$task_directory/"* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now traceforge-docker-backup.timer traceforge-docker-check.timer
echo 'Daily encrypted backups and five-minute health checks enabled. Inspect failures with systemctl and journalctl.'
