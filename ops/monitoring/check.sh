#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="${TRACEFORGE_ROOT:-/opt/traceforge}"
API_URL="${TRACEFORGE_API_URL:-http://127.0.0.1:3000}"
ALERT_HOOK="${TRACEFORGE_ALERT_HOOK:-}"

failures=()

if curl -fsS --max-time 5 "${API_URL}/health" >/dev/null; then
  echo "[OK] API health"
else
  echo "[FAIL] API health" >&2
  failures+=("API health")
fi

if curl -fsS --max-time 5 "${API_URL}/ready" >/dev/null; then
  echo "[OK] API readiness"
else
  echo "[FAIL] API readiness" >&2
  failures+=("API readiness")
fi

if "${ROOT_DIR}/chain/scripts/health-check.sh" --quiet; then
  echo "[OK] Chain health"
else
  echo "[FAIL] Chain health" >&2
  failures+=("Chain health")
fi

if monitor_output="$(
  cd "${ROOT_DIR}/indexer"
  npm run --silent monitor:prod 2>&1
)"; then
  echo "[OK] Indexer lag ${monitor_output}"
else
  echo "[FAIL] Indexer lag ${monitor_output}" >&2
  failures+=("Indexer lag")
fi

if (( ${#failures[@]} > 0 )); then
  message="TraceForge monitoring failure: ${failures[*]}"

  if [[ -n "${ALERT_HOOK}" ]]; then
    if [[ -x "${ALERT_HOOK}" ]]; then
      if ! "${ALERT_HOOK}" "${message}"; then
        echo "[WARN] Alert hook failed." >&2
      fi
    else
      echo "[WARN] TRACEFORGE_ALERT_HOOK is not executable." >&2
    fi
  fi

  echo "${message}" >&2
  exit 1
fi

echo "TRACEFORGE MONITORING HEALTHY."
