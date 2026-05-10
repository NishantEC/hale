import { writeFileSync } from 'node:fs';
import path from 'node:path';

const API = process.env.NOOP_API ?? 'https://api.noop.enform.co';
const TOKEN = process.env.NOOP_TOKEN;

if (!TOKEN) {
  console.error('Set NOOP_TOKEN.');
  process.exit(1);
}

async function fetchJson(p: string): Promise<any> {
  const res = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`);
  return res.json();
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

(async () => {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    dates.push(dayKey(d));
  }

  console.log(`Fetching last 3 days from ${API}: ${dates.join(', ')}`);

  const seen = new Set<string>();
  const all: any[] = [];
  for (const date of dates) {
    const chunk = await fetchJson(`/debug/raw-records?date=${date}&limit=50000`);
    const rows = chunk?.rows ?? chunk ?? [];
    let added = 0;
    for (const r of rows) {
      const key = `${r.id ?? r.timestamp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(r);
      added++;
    }
    console.log(`  ${date}: ${rows.length} fetched, ${added} new`);
  }

  all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const overview = await fetchJson(`/debug/overview?date=${dates[0]}`).catch(() => null);
  const sleepNight = await fetchJson(`/debug/sleep-night?date=${dates[0]}`).catch(() => null);

  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const last24h = all.filter((r) => new Date(r.timestamp) >= cutoff);

  const out = {
    fetchedAt: new Date().toISOString(),
    windowHours: 24,
    totalRecords: all.length,
    last24hRecords: last24h.length,
    rawRecords: last24h,
    fullRange: {
      first: all[0]?.timestamp,
      last: all[all.length - 1]?.timestamp,
    },
    overview,
    sleepNight,
  };

  const fixturePath = path.join(__dirname, '..', '.fixtures', `recent-${dates[0]}.json`);
  writeFileSync(fixturePath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${fixturePath}`);
  console.log(`Total fetched: ${all.length}`);
  console.log(`Last 24h: ${last24h.length}`);
  console.log(`Range: ${all[0]?.timestamp} → ${all[all.length - 1]?.timestamp}`);
  console.log(`Detected sleep night: ${sleepNight?.selectedDetection?.bedtime} → ${sleepNight?.selectedDetection?.wakeTime}`);
})();
