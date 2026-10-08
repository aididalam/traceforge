#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$task_root"
if command -v node >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' && [[ "${TRACEFORGE_FORCE_HELPER:-false}" != true ]]; then
  exec node ops/deploy/cli.mjs "$@"
fi
task_default_config="$task_root/.traceforge-deploy/deployment.env"
case "${1:-}" in node-*) task_default_config="$task_root/.traceforge-deploy/node.env" ;; esac
task_config="${TRACEFORGE_ENV_FILE:-$task_default_config}"
if [[ ! -f "$task_config" ]]; then echo 'Prepare the deployment configuration first.' >&2; exit 1; fi
task_setting() { awk -v key="$1" 'index($0,key "=")==1 {v=substr($0,length(key)+2);gsub(/^[ \t]+|[ \t]+$/,"",v);q=substr(v,1,1);if((q=="\""||q==sprintf("%c",39))&&substr(v,length(v),1)==q)v=substr(v,2,length(v)-2);print v;exit}' "$task_config"; }
task_context="$(task_setting TRACEFORGE_DOCKER_CONTEXT)"
task_data="$(task_setting TRACEFORGE_DATA_DIR)"
task_namespace="$(task_setting TRACEFORGE_IMAGE_NAMESPACE)"
task_version="$(task_setting TRACEFORGE_VERSION)"
task_mode="$(task_setting TRACEFORGE_IMAGE_MODE)"
task_mode="${task_mode:-pull}"
task_backup_destination="$(task_setting TRACEFORGE_BACKUP_DESTINATION)"
[[ "$task_data" == /* && "$task_data" != / && "$task_data" != /srv && "$task_data" != /home && "$task_data" != /tmp ]] || { echo 'Use a dedicated absolute data directory.' >&2; exit 1; }
[[ "$task_data" != */../* && "$task_data" != */.. && "$task_data" != */./* && "$task_data" != */. && "$task_data" != /Users ]] || exit 1
[[ "$task_namespace" =~ ^[a-z0-9][a-z0-9_-]*$ && "$task_version" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]] || exit 1
[[ "$task_mode" == build || "$task_mode" == pull ]] || exit 1
mkdir -p -m 700 "$task_data"
task_config="$(cd "$(dirname "$task_config")" && pwd)/$(basename "$task_config")"
# The helper controls this host's Docker daemon; run the wrapper ON the target host.
task_socket="${TRACEFORGE_DOCKER_SOCKET:-/var/run/docker.sock}"
if [[ ! -S "$task_socket" ]]; then task_socket="$HOME/.docker/run/docker.sock"; fi
task_endpoint="$(docker --context "$task_context" context inspect --format '{{.Endpoints.docker.Host}}')"
[[ "$task_endpoint" == unix://* ]] || { echo 'Run deployment commands on the Docker host.' >&2; exit 1; }
task_ops_image="$task_namespace/traceforge-ops:$task_version"
if [[ "$task_mode" == build && ( "${1:-}" == setup || "${1:-}" == images || "${1:-}" == build ) ]] || ! docker --context "$task_context" image inspect "$task_ops_image" >/dev/null 2>&1; then
  if [[ "$task_mode" == build ]]; then
    docker --context "$task_context" build -t "$task_ops_image" -f deploy/Dockerfile.ops .
  else
    docker --context "$task_context" pull "$task_ops_image"
  fi
fi
# Docker Desktop maps the socket to root:root even when its macOS group differs.
# Inspect the mounted socket inside the same image rather than guessing its GID.
task_socket_gid="$(docker --context "$task_context" run --rm \
  --mount "type=bind,source=$task_socket,target=/var/run/docker.sock" \
  --entrypoint stat "$task_namespace/traceforge-ops:$task_version" -c %g /var/run/docker.sock)"
task_mounts=()
# On Linux the download helper can use a loopback SSH tunnel on its host.
if [[ "${1:-}" == node-fetch && "$(uname -s)" == Linux ]]; then task_mounts+=(--network host); fi
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
  ${task_mounts[@]+"${task_mounts[@]}"} \
  --workdir "$task_root" \
  -e DOCKER_CONFIG=/tmp/traceforge-docker \
  -e "TRACEFORGE_ENV_FILE=$task_config" -e TRACEFORGE_HELPER_CONTAINER=true \
  -e "VERSION=${VERSION:-}" -e "BACKUP=${BACKUP:-}" -e "ADDRESS=${ADDRESS:-}" -e "ADD=${ADD:-}" -e "RPC=${RPC:-}" -e "TRACEFORGE_SCHEMA_COMPATIBLE=${TRACEFORGE_SCHEMA_COMPATIBLE:-}" -e "TRACEFORGE_RESTORE_EMPTY=${TRACEFORGE_RESTORE_EMPTY:-}" \
  "$task_namespace/traceforge-ops:$task_version" "$task_root/ops/deploy/cli.mjs" "$@"
