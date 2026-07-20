// Free the API-server port before booting so a stale/leftover instance (or a
// second `dev:local` run) can never crash startup with EADDRINUSE (which exits
// 1 → ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL). Local-dev only; safe & non-fatal —
// if it can't find or kill anything it just exits 0 and lets boot proceed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function resolvePort() {
  if (process.env.PORT && Number(process.env.PORT) > 0) return Number(process.env.PORT);
  // Mirror `--env-file=.env.local` used by the dev:local script.
  try {
    const env = readFileSync(join(here, ".env.local"), "utf8");
    const m = env.match(/^\s*PORT\s*=\s*"?(\d+)"?/m);
    if (m) return Number(m[1]);
  } catch {
    /* no .env.local — fall through to default */
  }
  return 5000;
}

const port = resolvePort();

function pidsOnPort() {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      // netstat lines: proto  local  foreign  STATE  PID
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/.test(line)) continue;
        if (!new RegExp(`[:.]${port}\\b`).test(line)) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
    } else {
      const out = execSync(`lsof -t -i tcp:${port} -s tcp:LISTEN`, { encoding: "utf8" });
      for (const pid of out.split(/\s+/)) if (/^\d+$/.test(pid)) pids.add(pid);
    }
  } catch {
    /* nothing listening / tool missing → treat as clear */
  }
  return [...pids];
}

const pids = pidsOnPort();
if (pids.length === 0) {
  console.log(`[free-port] port ${port} is free`);
} else {
  for (const pid of pids) {
    try {
      if (process.platform === "win32") execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      else execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      console.log(`[free-port] freed port ${port} (killed stale PID ${pid})`);
    } catch {
      console.log(`[free-port] could not kill PID ${pid} on port ${port} — continuing anyway`);
    }
  }
}
