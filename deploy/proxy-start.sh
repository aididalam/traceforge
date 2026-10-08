#!/bin/sh
set -eu
TRACEFORGE_PROXY_KEY="$(cat /run/secrets/proxy-key)"
export TRACEFORGE_PROXY_KEY
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
