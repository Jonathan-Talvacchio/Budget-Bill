// CI gate for production-dependency advisories.
// Fails on any high/critical advisory unless it is listed in
// scripts/audit-exceptions.json with an expiry date that hasn't passed yet.
// Expired exceptions fail too, so every accepted risk is re-reviewed.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const today = new Date().toISOString().slice(0, 10);

const { exceptions } = JSON.parse(readFileSync(new URL('./audit-exceptions.json', import.meta.url), 'utf8'));
const accepted = new Map(exceptions.map((e) => [e.id, e]));

let raw;
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);

// Collect root advisories (entries in `via` that are objects, not package names).
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split('/').pop() ?? String(via.source);
    advisories.set(id, { id, severity: via.severity, pkg: via.name, title: via.title, url: via.url });
  }
}

const failures = [];
for (const a of advisories.values()) {
  const ex = accepted.get(a.id);
  if (!ex) failures.push(`${a.severity.toUpperCase()} ${a.pkg}: ${a.title} (${a.url})`);
  else if (ex.expires < today) failures.push(`EXPIRED exception for ${a.id} (${a.pkg}, expired ${ex.expires}): re-review it`);
  else console.log(`accepted until ${ex.expires}: ${a.id} ${a.pkg} — ${ex.reason}`);
}
for (const id of accepted.keys()) {
  if (!advisories.has(id)) console.log(`note: exception ${id} no longer needed; remove it from audit-exceptions.json`);
}

if (failures.length) {
  console.error(`\n${failures.length} blocking advisor${failures.length === 1 ? 'y' : 'ies'}:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Audit gate passed (${advisories.size} high/critical advisories, all reviewed).`);
