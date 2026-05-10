import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const fixturePath = process.argv[2];
const label = process.argv[3] ?? 'baseline';

if (!fixturePath) {
  console.error('Usage: tsx scripts/raw-eval.ts .fixtures/recent-YYYY-MM-DD.json [label]');
  process.exit(1);
}

const SCREEN_DIR = (() => {
  const root = path.join(__dirname, '..', '..', '..', '.superpowers', 'brainstorm');
  if (!existsSync(root)) throw new Error('No brainstorm sessions');
  const dirs = readdirSync(root)
    .map((d: string) => ({ d, m: statSync(path.join(root, d)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return path.join(root, dirs[0].d, 'content');
})();

const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const records: any[] = (fixture.rawRecords ?? []).slice().sort(
  (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
);
const detection = fixture.sleepNight?.selectedDetection;

if (records.length === 0) {
  console.error('No raw records in fixture');
  process.exit(1);
}

const firstTs = new Date(records[0].timestamp).getTime();
const lastTs = new Date(records[records.length - 1].timestamp).getTime();
const spanMinutes = (lastTs - firstTs) / 60000;
const bedtimeTs = detection ? new Date(detection.bedtime).getTime() : null;
const wakeTs = detection ? new Date(detection.wakeTime).getTime() : null;
const detectionMinutes = bedtimeTs && wakeTs ? (wakeTs - bedtimeTs) / 60000 : 0;

const overlapStart = bedtimeTs ? Math.max(firstTs, bedtimeTs) : firstTs;
const overlapEnd = wakeTs ? Math.min(lastTs, wakeTs) : lastTs;
const overlapMinutes = Math.max(0, (overlapEnd - overlapStart) / 60000);

const recordsInDetection = bedtimeTs && wakeTs
  ? records.filter((r: any) => {
      const t = new Date(r.timestamp).getTime();
      return t >= bedtimeTs && t <= wakeTs;
    })
  : [];

function bucketByMinute(): Map<number, any[]> {
  const map = new Map<number, any[]>();
  for (const r of records) {
    const m = Math.floor(new Date(r.timestamp).getTime() / 60000);
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(r);
  }
  return map;
}

const minuteBuckets = bucketByMinute();
const totalMinutesInRange = Math.ceil((lastTs - firstTs) / 60000);
const minutesWithData = minuteBuckets.size;
const coverage = totalMinutesInRange ? minutesWithData / totalMinutesInRange : 0;

let nullsHr = 0;
let nullsGravity = 0;
let nullsSpo2 = 0;
let nullsSkinTemp = 0;
let nullsRr = 0;
let nullsContact = 0;
const hrs: number[] = [];
for (const r of records) {
  if (r.heartRate == null || r.heartRate === 0) nullsHr++;
  else hrs.push(r.heartRate);
  if (r.gravityMagnitude == null) nullsGravity++;
  if (r.spo2Red == null && r.spo2IR == null) nullsSpo2++;
  if (r.skinTempRaw == null || r.skinTempRaw === 0) nullsSkinTemp++;
  if (r.rrAverageMs == null) nullsRr++;
  if (r.skinContact == null) nullsContact++;
}
const hrMin = hrs.length ? Math.min(...hrs) : 0;
const hrMax = hrs.length ? Math.max(...hrs) : 0;
const hrAvg = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;

const W = 920;
const H = 240;

const allTs = records.map((r) => new Date(r.timestamp).getTime());
let plotMin = firstTs, plotMax = lastTs;
if (bedtimeTs && bedtimeTs < plotMin) plotMin = bedtimeTs;
if (wakeTs && wakeTs > plotMax) plotMax = wakeTs;
function tToX(t: number): number {
  return ((t - plotMin) / (plotMax - plotMin)) * W;
}

const hrDots = records
  .filter((r) => r.heartRate > 0)
  .map((r) => {
    const x = tToX(new Date(r.timestamp).getTime());
    const y = H - 60 - ((r.heartRate - 40) / (120 - 40)) * (H - 100);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4" fill="#3FB1E7"/>`;
  })
  .join('');

const detectionRect = bedtimeTs && wakeTs
  ? `<rect x="${tToX(bedtimeTs).toFixed(1)}" y="0" width="${(tToX(wakeTs) - tToX(bedtimeTs)).toFixed(1)}" height="${H}" fill="rgba(167,139,250,0.10)" stroke="#a78bfa" stroke-dasharray="4,4" stroke-width="1"/>`
  : '';

const minuteBars = (() => {
  const allMinutesSpan = Math.max(1, Math.ceil((plotMax - plotMin) / 60000));
  const bw = W / allMinutesSpan;
  return Array.from(minuteBuckets.entries())
    .map(([minute, recs]) => {
      const x = tToX(minute * 60000);
      const h = Math.min(20, recs.length * 2);
      return `<rect x="${x.toFixed(1)}" y="${(H - 30 - h).toFixed(1)}" width="${Math.max(1, bw).toFixed(1)}" height="${h}" fill="rgba(74,222,128,0.55)"/>`;
    })
    .join('');
})();

function fmtUTC(t: number): string {
  const d = new Date(t);
  return d.toISOString().slice(11, 16) + 'Z';
}
function fmtLocal(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(' ', '');
}

const html = `<style>
  .num { font-size: 26px; font-weight: 600; color: #fff; }
  .lbl { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 12px; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; }
  svg.timeline { background: #0d0e12; border-radius: 12px; }
  .alert { color: #f87171; }
  .ok { color: #4ade80; }
  h3 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 16px 0 6px; }
  .legend { display: flex; gap: 16px; font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 6px; }
  .legend .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: middle; margin-right: 4px; }
  table { font-size: 12px; color: rgba(255,255,255,0.85); }
  td { padding: 2px 8px; }
</style>

<h2>Raw signal eval — last 24 h <span style="opacity:0.5">·</span> <span style="color:#a78bfa">${label}</span></h2>
<p class="subtitle">Inspecting <code>${path.basename(fixturePath)}</code> · ${records.length} raw sensor records</p>

<div class="grid">
  <div class="card"><div class="lbl">Records</div><div class="num">${records.length}</div></div>
  <div class="card"><div class="lbl">Span</div><div class="num">${spanMinutes.toFixed(0)} min</div></div>
  <div class="card"><div class="lbl">Minutes with data</div><div class="num">${minutesWithData}</div></div>
  <div class="card"><div class="lbl">Coverage</div><div class="num ${coverage < 0.8 ? 'alert' : 'ok'}">${(coverage * 100).toFixed(0)}%</div></div>
</div>

<div class="grid">
  <div class="card"><div class="lbl">Detected sleep window</div><div class="num">${detectionMinutes.toFixed(0)} min</div></div>
  <div class="card"><div class="lbl">Records inside window</div><div class="num ${recordsInDetection.length < 50 ? 'alert' : 'ok'}">${recordsInDetection.length}</div></div>
  <div class="card"><div class="lbl">Window/data overlap</div><div class="num ${overlapMinutes < detectionMinutes * 0.5 ? 'alert' : 'ok'}">${overlapMinutes.toFixed(0)} min</div></div>
  <div class="card"><div class="lbl">Detection confidence</div><div class="num ${(detection?.confidence ?? 0) < 0.5 ? 'alert' : 'ok'}">${(detection?.confidence ?? 0).toFixed(2)}</div></div>
</div>

<h3>Timeline · HR points + minute coverage bars + detected sleep window</h3>
<svg class="timeline" width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
  ${detectionRect}
  ${minuteBars}
  ${hrDots}
  <line x1="0" x2="${W}" y1="${H - 30}" y2="${H - 30}" stroke="rgba(255,255,255,0.10)"/>
  <text x="6" y="14" fill="rgba(255,255,255,0.6)" font-size="10">HR (beats/min, plotted 40–120)</text>
  <text x="6" y="${H - 36}" fill="rgba(74,222,128,0.85)" font-size="10">records per minute</text>
</svg>
<div class="legend">
  <span><span class="swatch" style="background:#3FB1E7"></span> heart rate sample</span>
  <span><span class="swatch" style="background:rgba(74,222,128,0.55)"></span> records / minute</span>
  <span><span class="swatch" style="background:rgba(167,139,250,0.40);border:1px dashed #a78bfa"></span> detected sleep window</span>
</div>
<p class="subtitle" style="margin-top:6px">
  Plot range: ${fmtLocal(plotMin)} → ${fmtLocal(plotMax)} (local) · ${fmtUTC(plotMin)} → ${fmtUTC(plotMax)} UTC
</p>

<h3>Field nullness</h3>
<div class="card">
  <table>
    <tr><td>heart rate (zero/null)</td><td>${nullsHr} / ${records.length} (${((nullsHr / records.length) * 100).toFixed(0)}%)</td></tr>
    <tr><td>rr_average_ms null</td><td>${nullsRr} / ${records.length} (${((nullsRr / records.length) * 100).toFixed(0)}%)</td></tr>
    <tr><td>gravity null</td><td>${nullsGravity} / ${records.length} (${((nullsGravity / records.length) * 100).toFixed(0)}%)</td></tr>
    <tr><td>spo2 null</td><td>${nullsSpo2} / ${records.length} (${((nullsSpo2 / records.length) * 100).toFixed(0)}%)</td></tr>
    <tr><td>skin temp zero/null</td><td>${nullsSkinTemp} / ${records.length} (${((nullsSkinTemp / records.length) * 100).toFixed(0)}%)</td></tr>
    <tr><td>skin contact null</td><td>${nullsContact} / ${records.length} (${((nullsContact / records.length) * 100).toFixed(0)}%)</td></tr>
  </table>
</div>

<h3>HR summary</h3>
<div class="card">
  <table>
    <tr><td>min / avg / max</td><td>${hrMin} / ${hrAvg} / ${hrMax} bpm</td></tr>
    <tr><td>valid HR samples</td><td>${hrs.length}</td></tr>
  </table>
</div>

<h3>Detected sleep window</h3>
<div class="card">
  <table>
    <tr><td>bedtime</td><td>${detection?.bedtime ?? '--'} (${bedtimeTs ? fmtLocal(bedtimeTs) : '--'} local)</td></tr>
    <tr><td>wake time</td><td>${detection?.wakeTime ?? '--'} (${wakeTs ? fmtLocal(wakeTs) : '--'} local)</td></tr>
    <tr><td>duration hours</td><td>${detection?.durationHours?.toFixed(2) ?? '--'}</td></tr>
    <tr><td>continuity</td><td>${detection?.continuity?.toFixed(2) ?? '--'}</td></tr>
    <tr><td>valid coverage</td><td class="${(detection?.validCoverage ?? 0) < 0.5 ? 'alert' : 'ok'}">${detection?.validCoverage?.toFixed(2) ?? '--'}</td></tr>
  </table>
</div>
`;

mkdirSync(SCREEN_DIR, { recursive: true });
const fname = `raw-eval-${label}-${Date.now()}.html`;
writeFileSync(path.join(SCREEN_DIR, fname), html);

console.log('=== Raw signal eval ===');
console.log(`Records:                  ${records.length}`);
console.log(`First / last timestamp:   ${records[0].timestamp} / ${records[records.length - 1].timestamp}`);
console.log(`Span:                     ${spanMinutes.toFixed(0)} min`);
console.log(`Minutes with data:        ${minutesWithData} / ${totalMinutesInRange}  (coverage ${(coverage * 100).toFixed(0)}%)`);
console.log(`Detected sleep window:    ${detection?.bedtime} → ${detection?.wakeTime}  (${detectionMinutes.toFixed(0)} min)`);
console.log(`Records inside window:    ${recordsInDetection.length}`);
console.log(`Detected/data overlap:    ${overlapMinutes.toFixed(0)} min`);
console.log(`Detection confidence:     ${(detection?.confidence ?? 0).toFixed(2)}`);
console.log(`HR (min/avg/max):         ${hrMin} / ${hrAvg} / ${hrMax} bpm  (${hrs.length} valid samples)`);
console.log(`Field-null rates:         hr=${((nullsHr / records.length) * 100).toFixed(0)}%  rr=${((nullsRr / records.length) * 100).toFixed(0)}%  gravity=${((nullsGravity / records.length) * 100).toFixed(0)}%  spo2=${((nullsSpo2 / records.length) * 100).toFixed(0)}%  skintemp=${((nullsSkinTemp / records.length) * 100).toFixed(0)}%  contact=${((nullsContact / records.length) * 100).toFixed(0)}%`);
console.log(`Report:                   ${path.join(SCREEN_DIR, fname)}`);
