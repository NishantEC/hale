import { writeFileSync } from 'node:fs';
import path from 'node:path';

const API = process.env.NOOP_API ?? 'https://api.noop.enform.co';
const TOKEN = process.env.NOOP_TOKEN;
const DATE = process.argv[2];

if (!TOKEN) {
  console.error('Set NOOP_TOKEN to your session token (from the app, mmkv key authToken).');
  process.exit(1);
}
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error('Usage: tsx scripts/fetch-night.ts YYYY-MM-DD');
  process.exit(1);
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllRawRecords(date: string): Promise<any[]> {
  const all: any[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 80; page++) {
    const before = page === 0 ? '' : `&before=${encodeURIComponent(all[all.length - 1].timestamp)}`;
    const chunk = await fetchJson(`/debug/raw-records?date=${date}&limit=500${before}`);
    const rows = chunk?.rows ?? chunk ?? [];
    if (!rows.length) break;
    let added = 0;
    for (const r of rows) {
      const key = `${r.id ?? r.timestamp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(r);
      added++;
    }
    if (added === 0) break;
    if (rows.length < 500) break;
  }
  return all;
}

(async () => {
  console.log(`Fetching night ${DATE} from ${API}...`);
  const [rawRecords, sleepNight, sleepView] = await Promise.all([
    fetchAllRawRecords(DATE),
    fetchJson(`/debug/sleep-night?date=${DATE}`),
    fetchJson(`/views/sleep?date=${DATE}`),
  ]);

  const out = {
    date: DATE,
    fetchedAt: new Date().toISOString(),
    rawRecordCount: rawRecords.length,
    rawRecords,
    sleepNight,
    sleepView: {
      header: sleepView.header,
      score: sleepView.score,
      epochTimeline: sleepView.epochTimeline,
      stageRows: sleepView.stageRows,
      durationTrend: sleepView.durationTrend,
      sleepScoreTrend: sleepView.sleepScoreTrend,
    },
  };

  const fixturePath = path.join(__dirname, '..', '.fixtures', `night-${DATE}.json`);
  writeFileSync(fixturePath, JSON.stringify(out, null, 2));
  console.log(`Wrote fixture: ${fixturePath}`);
  console.log(`Raw records: ${out.rawRecordCount}`);
  console.log(`Bedtime: ${sleepNight?.selectedDetection?.bedtime}`);
  console.log(`WakeTime: ${sleepNight?.selectedDetection?.wakeTime}`);
})();
