import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

type Row = { capturedAt: Date; rawPayload: Buffer };

function parseArgs(argv: string[]) {
  const out: { eventNumbers?: number[]; limit?: number; hours?: number; userId?: string } = {};
  for (const arg of argv.slice(2)) {
    const [k, v] = arg.startsWith('--') ? arg.slice(2).split('=') : [arg, ''];
    if (k === 'eventNumber' || k === 'eventNumbers') {
      out.eventNumbers = v
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
    } else if (k === 'limit') {
      out.limit = parseInt(v, 10);
    } else if (k === 'hours') {
      out.hours = parseInt(v, 10);
    } else if (k === 'userId') {
      out.userId = v;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.eventNumbers || args.eventNumbers.length === 0) {
    console.error('Usage: ts-node dump-event-payloads.ts --eventNumbers=102,103 [--limit=200] [--hours=168] [--userId=...]');
    process.exit(1);
  }

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

  const baseDir = join(process.cwd(), '.fixtures', 'event-re');
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });

  for (const evtNum of args.eventNumbers) {
    const filters = ['"eventNumber" = $1'];
    const params: any[] = [evtNum];
    if (args.userId) {
      filters.push(`"userId" = $${params.length + 1}`);
      params.push(args.userId);
    }
    if (args.hours) {
      const since = new Date(Date.now() - args.hours * 60 * 60 * 1000);
      filters.push(`"capturedAt" >= $${params.length + 1}`);
      params.push(since);
    }
    const limitClause = args.limit ? `LIMIT ${args.limit}` : '';
    const sql = `
      SELECT "capturedAt", "rawPayload"
      FROM device_events
      WHERE ${filters.join(' AND ')}
      ORDER BY "capturedAt"
      ${limitClause}
    `;
    const rows: Row[] = await ds.query(sql, params);

    const lines: string[] = [];
    lines.push(`# Event ${evtNum} (0x${evtNum.toString(16).padStart(2, '0')}) RE report`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Filters: ${args.hours ? `hours=${args.hours}` : 'all-time'}${args.userId ? `, user=${args.userId}` : ''}${args.limit ? `, limit=${args.limit}` : ''}`);
    lines.push('');

    analyzeEvent(rows, evtNum, lines);

    const outDir = join(baseDir, `evt-${evtNum}`);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const reportPath = join(outDir, 'report.md');
    writeFileSync(reportPath, lines.join('\n'));

    const hex: string[] = [];
    hex.push(`# evt ${evtNum} raw hex samples`);
    hex.push(`# Format: <isoTimestamp> <len>B <hex>`);
    hex.push('');
    const samples = [...rows.slice(0, 10), ...rows.slice(-10)];
    for (const r of samples) {
      hex.push(`${r.capturedAt.toISOString()} ${r.rawPayload.length}B ${r.rawPayload.toString('hex')}`);
    }
    const hexPath = join(outDir, 'hex-samples.txt');
    writeFileSync(hexPath, hex.join('\n'));

    console.log(`evt ${evtNum}: ${rows.length} samples → ${reportPath}`);
  }

  await ds.destroy();
}

function analyzeEvent(rows: Row[], id: number, out: string[]) {
  out.push(`Total: ${rows.length}`);
  if (rows.length === 0) {
    out.push('(no rows — try widening --hours or removing --limit)');
    return;
  }

  const lenHist: Record<number, number> = {};
  for (const r of rows) lenHist[r.rawPayload.length] = (lenHist[r.rawPayload.length] ?? 0) + 1;
  out.push(`Length histogram: ${JSON.stringify(lenHist)}`);
  out.push(`First seen: ${rows[0].capturedAt.toISOString()}`);
  out.push(`Last seen: ${rows[rows.length - 1].capturedAt.toISOString()}`);
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
  out.push(`### uint16 LE candidates (>2 distinct)`);
  for (let i = 0; i + 1 < maxLen; i++) {
    const u: number[] = [];
    for (const r of rows) if (i + 1 < r.rawPayload.length) u.push(r.rawPayload[i] | (r.rawPayload[i + 1] << 8));
    if (u.length === 0) continue;
    const distinct = new Set(u).size;
    if (distinct < 3) continue;
    out.push(`  u16_le[${i}..${i + 1}]: range [${Math.min(...u)}..${Math.max(...u)}] distinct=${distinct}`);
  }

  out.push('');
  out.push(`### uint32 LE candidates (>2 distinct, looks like unix timestamp ~2026 range)`);
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
    const looksLikeUnix = min > 1_500_000_000 && max < 2_000_000_000;
    out.push(`  u32_le[${i}..${i + 3}]: range [${min}..${max}] distinct=${distinct}${looksLikeUnix ? ' ← likely UNIX timestamp' : ''}`);
  }
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
