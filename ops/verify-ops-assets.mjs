import {
  readFileSync,
} from "node:fs";

const required = new Map([
  [
    "ops/systemd/traceforge-erp-worker.service",
    [
      "User=traceforge",
      "WorkingDirectory=/opt/traceforge/api",
      "EnvironmentFile=/etc/traceforge/api.env",
      "Environment=TRACEFORGE_BROADCAST_ENABLED=false",
      "ExecStart=/usr/bin/node /opt/traceforge/api/dist/erp-worker.js",
      "Restart=on-failure",
      "KillSignal=SIGTERM",
      "TimeoutStopSec=90s",
    ],
  ],
  [
    "ops/systemd/traceforge-api.service",
    [
      "User=traceforge",
      "WorkingDirectory=/opt/traceforge/api",
      "EnvironmentFile=/etc/traceforge/api.env",
      "Environment=TRACEFORGE_BROADCAST_ENABLED=false",
      "ExecStart=/usr/bin/node /opt/traceforge/api/dist/server.js",
      "Restart=on-failure",
      "KillSignal=SIGTERM",
      "TimeoutStopSec=30s",
    ],
  ],
  [
    "ops/systemd/traceforge-indexer.service",
    [
      "Type=oneshot",
      "User=traceforge",
      "WorkingDirectory=/opt/traceforge/indexer",
      "EnvironmentFile=/etc/traceforge/indexer.env",
      "ExecStart=/usr/bin/npm run sync:prod",
    ],
  ],
  [
    "ops/systemd/traceforge-indexer.timer",
    [
      "Unit=traceforge-indexer.service",
      "OnBootSec=30s",
      "OnUnitActiveSec=30s",
      "Persistent=true",
    ],
  ],
  [
    "ops/README.md",
    [
      "verify:deployment-readiness",
      "verify:mysql-backup-restore",
      "verify:write-journal-readiness",
      "/health",
      "/ready",
      "health-check.sh",
      "Idempotency-Key",
    ],
  ],
]);

let failures = 0;

for (
  const [file, expected]
  of required
) {
  const text =
    readFileSync(
      file,
      "utf8"
    );

  for (
    const fragment
    of expected
  ) {
    if (
      !text.includes(
        fragment
      )
    ) {
      console.error(
        "FAIL " +
        file +
        " missing: " +
        fragment
      );

      failures +=
        1;
    }
  }

  if (
    text.includes(
      "TRACEFORGE_BROADCAST_ENABLED=true"
    )
  ) {
    console.error(
      "FAIL " +
      file +
      " enables broadcast by default"
    );

    failures +=
      1;
  }
}

if (
  failures > 0
) {
  throw new Error(
    "Operational asset verification failed: " +
    failures +
    " problem(s)."
  );
}

console.log(
  "OPS REFERENCE ASSETS VERIFIED."
);

console.log(
  "API defaults to broadcast disabled."
);

console.log(
  "Indexer uses a supervised oneshot timer."
);

console.log(
  "Runbook includes deployment, recovery, and backup verification."
);
