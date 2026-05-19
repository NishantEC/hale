import { computeDerivedMetrics, precomputeMetricSeries } from '../processing/derived-metrics';
import { readFileSync } from 'fs';
import { performance } from 'perf_hooks';
import { join } from 'path';

const FIXTURE = join(__dirname, '../../.fixtures/compute-engine-golden/normal-ist.json');
const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const { samples, sensorRecords, nightFeatures, sleepDetections, baseline, referenceDate, timeZone } = fx.input;

// Rehydrate Date fields (the fixture stores ISO strings).
const samplesD = samples.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
const sensorD = sensorRecords.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
const featuresD = nightFeatures.map((f: any) => ({ ...f, nightDate: new Date(f.nightDate) }));
const detD = sleepDetections.map((d: any) => ({
  ...d,
  nightDate: new Date(d.nightDate),
  bedtime: new Date(d.bedtime),
  wakeTime: new Date(d.wakeTime),
}));
const refDate = new Date(`${referenceDate}T00:00:00Z`);

// Warm up.
for (let i = 0; i < 10; i++) {
  const pre = precomputeMetricSeries(samplesD, sensorD);
  computeDerivedMetrics(samplesD, sensorD, featuresD, detD, baseline, refDate, timeZone, pre);
}

// Measure.
const N = 100;
const times: number[] = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const pre = precomputeMetricSeries(samplesD, sensorD);
  computeDerivedMetrics(samplesD, sensorD, featuresD, detD, baseline, refDate, timeZone, pre);
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const median = times[Math.floor(N / 2)];
const p10 = times[Math.floor(N * 0.1)];
const p90 = times[Math.floor(N * 0.9)];
const totalMs = times.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  iterations: N,
  totalMs: +totalMs.toFixed(2),
  medianMs: +median.toFixed(3),
  p10Ms: +p10.toFixed(3),
  p90Ms: +p90.toFixed(3),
  perIterMs: +(totalMs / N).toFixed(3),
}, null, 2));
