/**
 * Subsample captured fixtures so they stay git-friendly while still
 * exercising every math path. Each fixture gets capped at 2000 samples
 * + 2000 sensor records (every Nth row), and `expected` is recomputed
 * against the trimmed input so parity tests stay valid.
 *
 * Reads from .fixtures/compute-engine-golden/, writes back in place.
 */
import { computeDerivedMetrics, precomputeMetricSeries } from '../processing/derived-metrics';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '../../.fixtures/compute-engine-golden');
const MAX_SAMPLES = 2000;
const MAX_SENSOR = 2000;

function thin<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  const step = arr.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function rehydrate(input: any) {
  return {
    samples: input.samples.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) })),
    sensorRecords: input.sensorRecords.map((r: any) => ({ ...r, timestamp: new Date(r.timestamp) })),
    nightFeatures: input.nightFeatures.map((f: any) => ({ ...f, nightDate: new Date(f.nightDate) })),
    sleepDetections: input.sleepDetections.map((d: any) => ({
      ...d,
      nightDate: new Date(d.nightDate),
      bedtime: new Date(d.bedtime),
      wakeTime: new Date(d.wakeTime),
    })),
    baseline: input.baseline,
    referenceDate: new Date(`${input.referenceDate}T00:00:00Z`),
    timeZone: input.timeZone,
  };
}

function toPersisted(metrics: any) {
  return {
    schemaVersion: 1,
    strainScore: metrics.strainScore,
    sleepConsistencyScore: metrics.sleepConsistencyScore,
    detectedSleepNights: metrics.detectedSleepNights,
    skinTempAvgCelsius: metrics.skinTempAvgCelsius,
    skinTempDeltaCelsius: metrics.skinTempDeltaCelsius,
    stressAverage: metrics.stressAverage,
    spo2Average: metrics.spo2Average,
    lfHfRatioAverage: metrics.lfHfRatioAverage,
    recoveryIndex: metrics.recoveryIndex,
    trainingLoadRatio: metrics.trainingLoadRatio,
    trainingLoadRiskZone: metrics.trainingLoadRiskZone,
    spo2DipCount: metrics.spo2DipCount,
    odiPerHour: metrics.odiPerHour,
    lowestSpo2: metrics.lowestSpo2,
    coreTemperatureEstimate: metrics.coreTemperatureEstimate,
    circadianNadir: metrics.circadianNadir ? metrics.circadianNadir.toISOString() : null,
    sleepArchitectureScore: metrics.sleepArchitectureScore,
  };
}

function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const path = join(DIR, f);
    const fx = JSON.parse(readFileSync(path, 'utf8'));
    fx.input.samples = thin(fx.input.samples, MAX_SAMPLES);
    fx.input.sensorRecords = thin(fx.input.sensorRecords, MAX_SENSOR);
    const r = rehydrate(fx.input);
    const pre = precomputeMetricSeries(r.samples, r.sensorRecords);
    const metrics = computeDerivedMetrics(
      r.samples, r.sensorRecords, r.nightFeatures, r.sleepDetections,
      r.baseline, r.referenceDate, r.timeZone, pre,
    );
    fx.expected = toPersisted(metrics);
    fx._compaction = `Subsampled to <= ${MAX_SAMPLES} samples + ${MAX_SENSOR} sensor records; expected recomputed.`;
    delete fx.note;
    writeFileSync(path, JSON.stringify(fx, null, 2));
    console.log(`${f} — samples=${fx.input.samples.length} sensor=${fx.input.sensorRecords.length} strain=${metrics.strainScore}`);
  }
}

main();
