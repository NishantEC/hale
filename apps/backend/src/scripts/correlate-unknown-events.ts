import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

type EvtRow = { capturedAt: Date; eventNumber: number };

const UNKNOWNS = [102, 103, 68, 69, 56, 67, 61, 62];
const NEIGHBOR_WINDOW_MS = 30_000;

const NAMED = new Map<number, string>([
  [3, 'BatteryLevel'],
  [7, 'ChargingOn'],
  [8, 'ChargingOff'],
  [9, 'WristOn'],
  [10, 'WristOff'],
  [11, 'BleConnectionUp'],
  [12, 'BleConnectionDown'],
  [21, 'BatteryPackConnected'],
  [22, 'BatteryPackRemoved'],
  [29, 'StrapConditionReport'],
  [32, 'CaptouchAutothresholdAction'],
  [33, 'BleRealtimeHROn'],
  [34, 'BleRealtimeHROff'],
  [36, 'AfeReset'],
  [46, 'RawDataCollectionOn'],
  [47, 'RawDataCollectionOff'],
  [56, 'StrapDrivenAlarmSet'],
  [57, 'StrapDrivenAlarmExecuted'],
  [59, 'StrapDrivenAlarmDisabled'],
  [60, 'HapticsFired'],
  [63, 'ExtendedBatteryInformation'],
  [68, 'HighFreqSyncChunkStart'],
  [69, 'HighFreqSyncChunkEnd'],
  [96, 'HighFreqSyncPrompt'],
  [97, 'HighFreqSyncEnabled'],
  [98, 'HighFreqSyncDisabled'],
  [100, 'HapticsTerminated'],
  [102, 'OpticalSampleChannelA'],
  [103, 'OpticalSampleChannelB'],
]);

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

  const all: EvtRow[] = await ds.query(`
    SELECT "capturedAt", "eventNumber" FROM device_events ORDER BY "capturedAt"
  `);

  const out: string[] = [];
  out.push('# Unknown event correlation report');
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(`Window: ±${NEIGHBOR_WINDOW_MS / 1000}s around each unknown.`);
  out.push('');

  for (const u of UNKNOWNS) {
    const ours = all.filter((r) => r.eventNumber === u);
    if (ours.length === 0) {
      out.push(`## evt ${u} — no samples`);
      out.push('');
      continue;
    }
    out.push(`## evt ${u} (0x${u.toString(16).padStart(2, '0')}) — ${ours.length} samples`);
    out.push(`First: ${ours[0].capturedAt.toISOString()}, last: ${ours[ours.length - 1].capturedAt.toISOString()}`);

    // Cadence: gaps between consecutive firings (median, p10, p90)
    if (ours.length >= 3) {
      const gapsMs: number[] = [];
      for (let i = 1; i < ours.length; i++) {
        gapsMs.push(ours[i].capturedAt.getTime() - ours[i - 1].capturedAt.getTime());
      }
      gapsMs.sort((a, b) => a - b);
      const median = gapsMs[Math.floor(gapsMs.length / 2)];
      const p10 = gapsMs[Math.floor(gapsMs.length * 0.1)];
      const p90 = gapsMs[Math.floor(gapsMs.length * 0.9)];
      out.push(`Cadence: median ${fmtSec(median)}, p10 ${fmtSec(p10)}, p90 ${fmtSec(p90)}.`);
    }

    // Neighbor histogram: which other event types fire within ±window
    const neighborCount: Map<number, number> = new Map();
    const otherTimes = all
      .filter((r) => r.eventNumber !== u)
      .map((r) => ({ t: r.capturedAt.getTime(), n: r.eventNumber }))
      .sort((a, b) => a.t - b.t);
    const otherTimesOnly = otherTimes.map((x) => x.t);

    for (const evt of ours) {
      const t = evt.capturedAt.getTime();
      const lo = bisectLeft(otherTimesOnly, t - NEIGHBOR_WINDOW_MS);
      const hi = bisectLeft(otherTimesOnly, t + NEIGHBOR_WINDOW_MS);
      for (let i = lo; i < hi; i++) {
        const n = otherTimes[i].n;
        neighborCount.set(n, (neighborCount.get(n) ?? 0) + 1);
      }
    }
    const ranked = [...neighborCount.entries()]
      .map(([n, c]) => ({ n, c, share: c / ours.length }))
      .sort((a, b) => b.c - a.c);
    out.push(`Neighbor frequency (events firing within ±${NEIGHBOR_WINDOW_MS / 1000}s, share of our N=${ours.length}):`);
    for (const r of ranked.slice(0, 10)) {
      const name = NAMED.get(r.n) ?? `unknown_${r.n}`;
      out.push(`  evt ${String(r.n).padStart(3)} (${name}): ${r.c}× (${(r.share * 100).toFixed(0)}%)`);
    }

    out.push('');
  }

  const outDir = join(process.cwd(), '.fixtures', 'event-re');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, 'correlation-report.md');
  writeFileSync(reportPath, out.join('\n'));
  console.log(`Report: ${reportPath}`);

  await ds.destroy();
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

function fmtSec(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
