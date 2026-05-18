/**
 * CI lint that ensures committed compute-engine golden fixtures don't
 * carry any prod-traceable data: UUIDs, identifiable user IDs, free-text
 * journal entries, original (un-shifted) timestamps.
 *
 * Exit non-zero on any violation.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '../.fixtures/compute-engine-golden');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const NON_ANON_USER_ID = /"userId"\s*:\s*"[A-Za-z0-9]{16,}"/;
const JOURNAL_NOTE = /"note"\s*:\s*"[^"]+"/;
// Captured timestamps are shifted so the reference day starts 2026-01-01.
// Anything outside ±60 days of EPOCH suggests un-shifted data.
const EPOCH_MS = new Date('2026-01-01T00:00:00.000Z').getTime();
const SIXTY_DAYS_MS = 60 * 86400 * 1000;

let failed = false;
const files = readdirSync(DIR).filter((x) => x.endsWith('.json'));
if (files.length === 0) {
  console.error('check-fixtures: no fixtures found in', DIR);
  process.exit(1);
}
for (const f of files) {
  const path = join(DIR, f);
  const text = readFileSync(path, 'utf8');
  if (UUID.test(text)) {
    console.error(`${f}: contains UUID`);
    failed = true;
  }
  if (NON_ANON_USER_ID.test(text)) {
    console.error(`${f}: contains non-anonymized userId`);
    failed = true;
  }
  if (JOURNAL_NOTE.test(text)) {
    console.error(`${f}: contains journal note text`);
    failed = true;
  }
  try {
    const parsed = JSON.parse(text);
    const checkTs = (label: string, t: string | null | undefined) => {
      if (!t || typeof t !== 'string') return;
      const ms = new Date(t).getTime();
      if (Math.abs(ms - EPOCH_MS) > SIXTY_DAYS_MS) {
        console.error(`${f}: ${label} timestamp ${t} is outside ±60d of EPOCH (un-shifted data?)`);
        failed = true;
      }
    };
    for (const s of parsed.input?.samples ?? []) checkTs('sample', s.timestamp);
    for (const s of parsed.input?.sensorRecords ?? []) checkTs('sensorRecord', s.timestamp);
    for (const f of parsed.input?.nightFeatures ?? []) checkTs('nightFeature', f.nightDate);
    for (const d of parsed.input?.sleepDetections ?? []) {
      checkTs('detection.nightDate', d.nightDate);
      checkTs('detection.bedtime', d.bedtime);
      checkTs('detection.wakeTime', d.wakeTime);
    }
  } catch (e) {
    console.error(`${f}: failed to parse:`, (e as Error).message);
    failed = true;
  }
}

if (failed) {
  console.error(`check-fixtures: failed`);
  process.exit(1);
}
console.log(`check-fixtures: ${files.length} fixtures clean`);
