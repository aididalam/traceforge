#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$task_root"
if command -v node >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' && [[ "${TRACEFORGE_FORCE_HELPER:-false}" != true ]]; then
  exec node ops/deploy/cli.mjs "$@"
fi
task_config="${TRACEFORGE_ENV_FILE:-$task_root/.traceforge-deploy/deployment.env}"
if [[ ! -f "$task_config" ]]; then echo 'Prepare the deployment configuration first.' >&2; exit 1; fi
task_setting() { awk -v key="$1" 'index($0,key "=")==1 {print substr($0,length(key)+2); exit}' "$task_config"; }
task_context="$(task_setting TRACEFORGE_DOCKER_CONTEXT)"
task_data="$(task_setting TRACEFORGE_DATA_DIR)"
task_namespace="$(task_setting TRACEFORGE_IMAGE_NAMESPACE)"
task_version="$(task_setting TRACEFORGE_VERSION)"
task_backup_destination="$(task_setting TRACEFORGE_BACKUP_DESTINATION)"
[[ "$task_data" == /* && "$task_data" != / && "$task_data" != /srv && "$task_data" != /home && "$task_data" != /tmp ]] || { echo 'Use a dedicated absolute data directory.' >&2; exit 1; }
mkdir -p "$task_data"
task_config="$(cd "$(dirname "$task_config")" && pwd)/$(basename "$task_config")"
# The helper controls this host's Docker daemon; run the wrapper ON the target host.
task_socket="${TRACEFORGE_DOCKER_SOCKET:-/var/run/docker.sock}"
if [[ ! -S "$task_socket" ]]; then task_socket="$HOME/.docker/run/docker.sock"; fi
# Docker Desktop maps the socket to root:root even when its macOS group differs.
# Inspect the mounted socket inside the same image rather than guessing its GID.
task_socket_gid="$(docker --context "$task_context" run --rm \
  --mount "type=bind,source=$task_socket,target=/var/run/docker.sock" \
  --entrypoint stat "$task_namespace/traceforge-ops:$task_version" -c %g /var/run/docker.sock)"
task_mounts=()
case "$task_config" in
  "$task_root"/*) ;;
  *) task_config_directory="$(dirname "$task_config")"; task_mounts+=(--mount "type=bind,source=$task_config_directory,target=$task_config_directory") ;;
esac
if [[ -n "$task_backup_destination" ]]; then
  [[ -d "$task_backup_destination" && "$task_backup_destination" == /* ]] || { echo 'Backup destination must be an existing absolute directory.' >&2; exit 1; }
  task_mounts+=(--mount "type=bind,source=$task_backup_destination,target=$task_backup_destination")
fi
exec docker --context "$task_context" run --rm \
  --user "$(id -u):$(id -g)" --group-add "$task_socket_gid" \
  --mount "type=bind,source=$task_socket,target=/var/run/docker.sock" \
  --mount "type=bind,source=$task_root,target=$task_root" \
  --mount "type=bind,source=$task_data,target=$task_data" \
  "${task_mounts[@]}" \
  --workdir "$task_root" \
  -e "TRACEFORGE_ENV_FILE=$task_config" -e TRACEFORGE_HELPER_CONTAINER=true \
  -e "VERSION=${VERSION:-}" -e "BACKUP=${BACKUP:-}" -e "TRACEFORGE_SCHEMA_COMPATIBLE=${TRACEFORGE_SCHEMA_COMPATIBLE:-}" -e "TRACEFORGE_RESTORE_EMPTY=${TRACEFORGE_RESTORE_EMPTY:-}" \
  "$task_namespace/traceforge-ops:$task_version" "$task_root/ops/deploy/cli.mjs" "$@"
