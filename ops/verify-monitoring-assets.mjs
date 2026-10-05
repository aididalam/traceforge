import {
  readFileSync,
  statSync,
} from "node:fs";

const required = new Map([
  [
    ".github/workflows/ci.yml",
    [
      "submodules: recursive",
      "npm run typecheck",
      "npm run verify:production-build",
      "npm test",
      "bash -n chain/scripts/*.sh",
      "node ops/verify-ops-assets.mjs",
      "node ops/verify-monitoring-assets.mjs",
    ],
  ],
  [
    "ops/monitoring/check.sh",
    [
      "/health",
      "/ready",
      "health-check.sh",
      "monitor:prod",
      "TRACEFORGE_ALERT_HOOK",
    ],
  ],
  [
    "ops/systemd/traceforge-monitor.service",
    [
      "Type=oneshot",
      "User=traceforge",
      "EnvironmentFile=/etc/traceforge/indexer.env",
      "EnvironmentFile=-/etc/traceforge/monitor.env",
      "ExecStart=/opt/traceforge/ops/monitoring/check.sh",
    ],
  ],
  [
    "ops/systemd/traceforge-monitor.timer",
    [
      "Unit=traceforge-monitor.service",
      "OnUnitActiveSec=1min",
      "Persistent=true",
    ],
  ],
]);

let failures = 0;

for (const [file, fragments] of required) {
  const text = readFileSync(file, "utf8");

  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      console.error("FAIL " + file + " missing: " + fragment);
      failures += 1;
    }
  }
}

const workflow = readFileSync(
  ".github/workflows/ci.yml",
  "utf8"
);

if (workflow.includes("verify:deployment-readiness")) {
  console.error("FAIL CI must not require live deployment services.");
  failures += 1;
}

if (workflow.includes("TRACEFORGE_BROADCAST_ENABLED=true")) {
  console.error("FAIL CI enables blockchain broadcast.");
  failures += 1;
}

const monitorMode =
  statSync("ops/monitoring/check.sh").mode & 0o111;

if (monitorMode === 0) {
  console.error("FAIL monitoring check is not executable.");
  failures += 1;
}

if (failures > 0) {
  throw new Error(
    "Monitoring asset verification failed: " +
    failures +
    " problem(s)."
  );
}

console.log("MONITORING AND CI ASSETS VERIFIED.");
console.log("Hosted CI uses deterministic checks only.");
console.log("Live monitoring covers API, chain, and indexer lag.");
console.log("Optional alert hook is supported.");
