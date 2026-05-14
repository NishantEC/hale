import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

type Row = { capturedAt: Date; rawPayload: Buffer };
type SocRow = { capturedAt: Date; tenths: number };

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5435', 10),
    username: process.env.DB_USER || 'noop',
    password: process.env.DB_PASSWORD || 'noop_dev',
    database: process.env.DB_NAME || 'noop',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();

  const e3: Row[] = await ds.query(`
    SELECT "capturedAt", "rawPayload"
    FROM device_events
    WHERE "eventNumber" = 3
    ORDER BY "capturedAt"
  `);
  const e63: Row[] = await ds.query(`
    SELECT "capturedAt", "rawPayload"
    FROM device_events
    WHERE "eventNumber" = 63
    ORDER BY "capturedAt"
  `);
  const fg: SocRow[] = await ds.query(`
    SELECT "capturedAt", ((metadata->>'batterySocTenths')::int) AS tenths
    FROM console_logs
    WHERE metadata ? 'batterySocTenths'
    ORDER BY "capturedAt"
  `);

  const lines: string[] = [];
  lines.push(`# Battery event RE report`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Inputs: evt3=${e3.length}, evt63=${e63.length}, fgSoc=${fg.length}`);
  lines.push('');

  analyzeEvent(e3, 3, 'BatteryLevel', lines);
  analyzeEvent(e63, 63, 'ExtendedBatteryInformation', lines);
  crossCorrelate(e3, 'evt3', fg, lines);
  crossCorrelate(e63, 'evt63', fg, lines);

  // Validation: charging transitions
  const chargingOn: { capturedAt: Date }[] = await ds.query(`
    SELECT "capturedAt" FROM device_events
    WHERE "eventNumber" = 7 ORDER BY "capturedAt"
  `);
  const chargingOff: { capturedAt: Date }[] = await ds.query(`
    SELECT "capturedAt" FROM device_events
    WHERE "eventNumber" = 8 ORDER BY "capturedAt"
  `);
  analyzeChargingTransitions(e3, 'evt3', chargingOn, chargingOff, lines);
  analyzeChargingTransitions(e63, 'evt63', chargingOn, chargingOff, lines);

  const outDir = join(process.cwd(), '.fixtures', 'battery-re');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, 'report.md');
  writeFileSync(reportPath, lines.join('\n'));

  // Also dump raw hex samples to a separate file (gitignored).
  // 5 earliest, 5 latest, plus 5 around each ChargingOn/Off transition window
  // are captured so we can eyeball field changes near charger plug events.
  const hex: string[] = [];
  hex.push(`# Raw hex samples for event 3 and event 63`);
  hex.push(`# Format: <isoTimestamp> <evtId> <len>B <hex>`);
  hex.push('');
  for (const [name, rows] of [['evt3', e3], ['evt63', e63]] as const) {
    hex.push(`## ${name} — first 5`);
    for (const r of rows.slice(0, 5)) hex.push(`${r.capturedAt.toISOString()} ${name} ${r.rawPayload.length}B ${r.rawPayload.toString('hex')}`);
    hex.push(`## ${name} — last 5`);
    for (const r of rows.slice(-5)) hex.push(`${r.capturedAt.toISOString()} ${name} ${r.rawPayload.length}B ${r.rawPayload.toString('hex')}`);
    hex.push('');
  }
  const hexPath = join(outDir, 'hex-samples.txt');
  writeFileSync(hexPath, hex.join('\n'));

  console.log(`Report: ${reportPath}`);
  console.log(`Hex samples: ${hexPath}`);
  console.log(`Lines in report: ${lines.length}`);

  await ds.destroy();
}

function analyzeEvent(rows: Row[], id: number, name: string, out: string[]) {
  out.push(`## Event ${id} — ${name}`);
  out.push(`Total: ${rows.length}`);
  if (rows.length === 0) {
    out.push('(no rows)');
    out.push('');
    return;
  }

  const lenHist: Record<number, number> = {};
  for (const r of rows) lenHist[r.rawPayload.length] = (lenHist[r.rawPayload.length] ?? 0) + 1;
  out.push(`Length histogram: ${JSON.stringify(lenHist)}`);
  const maxLen = Math.max(...Object.keys(lenHist).map(Number));

  out.push('');
  out.push(`### Per-byte stats`);
  for (let i = 0; i < maxLen; i++) {
    const vals: number[] = [];
    for (const r of rows) if (i < r.rawPayload.length) vals.push(r.rawPayload[i]);
    if (vals.length === 0) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const distinct = new Set(vals).size;
    const mode = mostCommon(vals);
    const modeShare = vals.filter((v) => v === mode).length / vals.length;
    out.push(
      `  byte[${i}]: range [${min}..${max}] (0x${hex2(min)}..0x${hex2(max)}) distinct=${distinct} mode=${mode} (0x${hex2(mode)}, ${(modeShare * 100).toFixed(1)}%)`,
    );
  }

  out.push('');
  out.push(`### uint16 LE interpretations (positions with >2 distinct values)`);
  for (let i = 0; i + 1 < maxLen; i++) {
    const u: number[] = [];
    for (const r of rows) if (i + 1 < r.rawPayload.length) u.push(r.rawPayload[i] | (r.rawPayload[i + 1] << 8));
    if (u.length === 0) continue;
    const distinct = new Set(u).size;
    if (distinct < 3) continue;
    const min = Math.min(...u);
    const max = Math.max(...u);
    out.push(`  u16_le[${i}..${i + 1}]: range [${min}..${max}] distinct=${distinct}`);
  }

  out.push('');
  out.push(`### int16 LE interpretations (positions with >2 distinct values, treated signed)`);
  for (let i = 0; i + 1 < maxLen; i++) {
    const u: number[] = [];
    for (const r of rows) {
      if (i + 1 < r.rawPayload.length) {
        let v = r.rawPayload[i] | (r.rawPayload[i + 1] << 8);
        if (v & 0x8000) v -= 0x10000;
        u.push(v);
      }
    }
    if (u.length === 0) continue;
    const distinct = new Set(u).size;
    if (distinct < 3) continue;
    const min = Math.min(...u);
    const max = Math.max(...u);
    if (min >= 0) continue; // only show if actually signed
    out.push(`  i16_le[${i}..${i + 1}]: range [${min}..${max}] distinct=${distinct}`);
  }

  out.push('');
  out.push(`### uint32 LE interpretations (positions with >2 distinct values, max < 2^31)`);
  for (let i = 0; i + 3 < maxLen; i++) {
    const u: number[] = [];
    for (const r of rows) {
      if (i + 3 < r.rawPayload.length) {
        const v =
          r.rawPayload[i] |
          (r.rawPayload[i + 1] << 8) |
          (r.rawPayload[i + 2] << 16) |
          (r.rawPayload[i + 3] * 0x1000000);
        u.push(v);
      }
    }
    if (u.length === 0) continue;
    const distinct = new Set(u).size;
    if (distinct < 3) continue;
    const min = Math.min(...u);
    const max = Math.max(...u);
    out.push(`  u32_le[${i}..${i + 3}]: range [${min}..${max}] distinct=${distinct}`);
  }

  out.push('');
}

function crossCorrelate(rows: Row[], label: string, fg: SocRow[], out: string[]) {
  out.push(`## Cross-correlation: ${label} vs FG SOC (tenths) within ±120s`);
  if (rows.length === 0 || fg.length === 0) {
    out.push('(insufficient data)');
    out.push('');
    return;
  }
  const fgSorted = fg.slice().sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const fgTimes = fgSorted.map((s) => s.capturedAt.getTime());

  const maxLen = Math.max(...rows.map((r) => r.rawPayload.length));
  out.push(`Range of FG SOC tenths: [${Math.min(...fg.map((f) => f.tenths))}..${Math.max(...fg.map((f) => f.tenths))}]`);

  // For each byte and each multi-byte interpretation, compute Pearson r against the nearest FG SOC sample
  for (let pos = 0; pos < maxLen; pos++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of rows) {
      if (pos >= r.rawPayload.length) continue;
      const t = r.capturedAt.getTime();
      const idx = nearestIdx(fgTimes, t);
      if (idx < 0) continue;
      if (Math.abs(fgTimes[idx] - t) > 120_000) continue;
      xs.push(r.rawPayload[pos]);
      ys.push(fgSorted[idx].tenths);
    }
    if (xs.length < 20) continue;
    const r = pearson(xs, ys);
    if (Math.abs(r) >= 0.7) out.push(`  byte[${pos}] vs FG: r=${r.toFixed(3)} n=${xs.length}`);
  }
  for (let pos = 0; pos + 1 < maxLen; pos++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of rows) {
      if (pos + 1 >= r.rawPayload.length) continue;
      const t = r.capturedAt.getTime();
      const idx = nearestIdx(fgTimes, t);
      if (idx < 0) continue;
      if (Math.abs(fgTimes[idx] - t) > 120_000) continue;
      xs.push(r.rawPayload[pos] | (r.rawPayload[pos + 1] << 8));
      ys.push(fgSorted[idx].tenths);
    }
    if (xs.length < 20) continue;
    const r = pearson(xs, ys);
    if (Math.abs(r) >= 0.7) out.push(`  u16_le[${pos}..${pos + 1}] vs FG: r=${r.toFixed(3)} n=${xs.length}`);
  }
  out.push('');
}

function analyzeChargingTransitions(
  rows: Row[],
  label: string,
  on: { capturedAt: Date }[],
  off: { capturedAt: Date }[],
  out: string[],
) {
  out.push(`## Charging-transition validation: ${label}`);
  out.push(`ChargingOn events: ${on.length}, ChargingOff events: ${off.length}`);
  if (rows.length === 0 || (on.length === 0 && off.length === 0)) {
    out.push('(insufficient data)');
    out.push('');
    return;
  }
  const sorted = rows.slice().sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const times = sorted.map((r) => r.capturedAt.getTime());
  const maxLen = Math.max(...sorted.map((r) => r.rawPayload.length));

  type Sample = { before: Row; after: Row; dt: number };
  function pairsForTransitions(events: { capturedAt: Date }[], windowMs: number): Sample[] {
    const samples: Sample[] = [];
    for (const ev of events) {
      const t = ev.capturedAt.getTime();
      const beforeIdx = bisectLeft(times, t) - 1;
      const afterIdx = bisectLeft(times, t);
      if (beforeIdx < 0 || afterIdx >= sorted.length) continue;
      const before = sorted[beforeIdx];
      const after = sorted[afterIdx];
      if (t - times[beforeIdx] > windowMs || times[afterIdx] - t > windowMs) continue;
      samples.push({ before, after, dt: times[afterIdx] - times[beforeIdx] });
    }
    return samples;
  }

  for (const [transition, evs] of [
    ['ChargingOn (plug-in)', on],
    ['ChargingOff (plug-out)', off],
  ] as const) {
    out.push('');
    out.push(`### ${transition}`);
    const samples = pairsForTransitions(evs, 120_000);
    out.push(`Paired events found (within ±120s window each side): ${samples.length}`);
    if (samples.length === 0) continue;

    // For each interesting byte position, compute median delta after - before
    const summarizeDelta = (extractor: (buf: Buffer) => number | null, name: string) => {
      const deltas: number[] = [];
      for (const s of samples) {
        const b = extractor(s.before.rawPayload);
        const a = extractor(s.after.rawPayload);
        if (b == null || a == null) continue;
        deltas.push(a - b);
      }
      if (deltas.length === 0) return;
      deltas.sort((a, b) => a - b);
      const median = deltas[Math.floor(deltas.length / 2)];
      const min = deltas[0];
      const max = deltas[deltas.length - 1];
      const positives = deltas.filter((d) => d > 0).length;
      const negatives = deltas.filter((d) => d < 0).length;
      const zeros = deltas.filter((d) => d === 0).length;
      out.push(`  ${name}: median=${median}, range=[${min}..${max}], +${positives}/-${negatives}/0=${zeros} (n=${deltas.length})`);
    };

    summarizeDelta((buf) => readU16LE(buf, 14), 'u16_le[14..15] (hyp. voltage mV)');
    summarizeDelta((buf) => readU16LE(buf, 10), 'u16_le[10..11] (hyp. SOC tenths, evt3)');
    summarizeDelta((buf) => readU16LE(buf, 25), 'u16_le[25..26] (hyp. SOC tenths, evt63)');
    summarizeDelta((buf) => readU16LE(buf, 16), 'u16_le[16..17] (hyp. temp ×10°C, evt63)');
    summarizeDelta((buf) => (buf.length > 21 ? buf[21] : null), 'byte[21] (hyp. icon level 0..7, evt63)');
    summarizeDelta((buf) => (buf.length > 3 ? buf[3] : null), 'byte[3] (mystery, neg-corr with SOC)');
    summarizeDelta((buf) => (buf.length > 18 ? buf[18] : null), 'byte[18] (evt63 only, range 0..11)');
    summarizeDelta((buf) => (buf.length > 11 ? buf[11] : null), 'byte[11] (evt3 0..3, evt63 0..255)');
  }

  out.push('');
}

function bisectLeft(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function readU16LE(buf: Buffer, offset: number): number | null {
  if (offset + 1 >= buf.length) return null;
  return buf[offset] | (buf[offset + 1] << 8);
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function nearestIdx(sortedTimes: number[], t: number): number {
  let lo = 0;
  let hi = sortedTimes.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTimes[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sortedTimes[lo - 1] - t) < Math.abs(sortedTimes[lo] - t)) return lo - 1;
  return lo;
}

function mostCommon(arr: number[]): number {
  const m = new Map<number, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  let bestKey = arr[0];
  let bestCount = -1;
  for (const [k, c] of m) {
    if (c > bestCount) {
      bestCount = c;
      bestKey = k;
    }
  }
  return bestKey;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
