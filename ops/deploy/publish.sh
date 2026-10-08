#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$task_root"
task_version="${VERSION:?Set a new immutable VERSION tag}"
task_namespace="${TRACEFORGE_IMAGE_NAMESPACE:-aididalam}"
[[ "$task_version" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ && "$task_namespace" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || exit 1
task_context="${TRACEFORGE_DOCKER_CONTEXT:-default}"
task_platforms="${TRACEFORGE_PLATFORMS:-linux/amd64,linux/arm64}"
read -r -a task_components <<< "${TRACEFORGE_COMPONENTS:-api indexer ui contract-tools ops}"
for task_component in "${task_components[@]}"; do
  [[ "$task_component" =~ ^(api|indexer|ui|contract-tools|ops)$ ]] || exit 1
  case "$task_component" in
    contract-tools) task_source=contracts; task_file=contracts/Dockerfile ;;
    ops) task_source=.; task_file=deploy/Dockerfile.ops ;;
    *) task_source="$task_component"; task_file="$task_component/Dockerfile" ;;
  esac
  task_image="$task_namespace/traceforge-$task_component:$task_version"
  if docker --context "$task_context" buildx imagetools inspect "$task_image" >/dev/null 2>&1; then
    echo "Release tag already exists: $task_image. Choose a new version." >&2; exit 1
  fi
  task_revision="$(git -C "$task_source" rev-parse HEAD)"
  docker --context "$task_context" buildx build --platform "$task_platforms" \
    --label "org.opencontainers.image.revision=$task_revision" \
    --label "org.opencontainers.image.source=https://github.com/aididalam/traceforge" \
    --tag "$task_image" --file "$task_file" --push "$task_source"
done
