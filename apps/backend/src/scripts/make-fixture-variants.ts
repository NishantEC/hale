/**
 * Derive synthetic edge-case fixtures from a captured base fixture. Each
 * variant transforms the input minimally and re-runs computeDerivedMetrics
 * to refresh the expected output, so the variants stay parity-test-able
 * against the JS implementation.
 */
import { computeDerivedMetrics, precomputeMetricSeries } from '../processing/derived-metrics';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '../../.fixtures/compute-engine-golden');

type Fixture = {
  description: string;
  capturedAt: string;
  sourceUserHash: string;
  input: any;
  expected: any;
};

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

function runJs(input: any) {
  const r = rehydrate(input);
  const pre = precomputeMetricSeries(r.samples, r.sensorRecords);
  return computeDerivedMetrics(
    r.samples, r.sensorRecords, r.nightFeatures, r.sleepDetections,
    r.baseline, r.referenceDate, r.timeZone, pre,
  );
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

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

function writeVariant(name: string, baseInput: any, mutate: (input: any) => void): void {
  const input = clone(baseInput);
  mutate(input);
  const metrics = runJs(input);
  const fixture: Fixture = {
    description: name,
    capturedAt: new Date().toISOString(),
    sourceUserHash: 'derived-from-normal-ist',
    input,
    expected: toPersisted(metrics),
  };
  writeFileSync(join(DIR, `${name}.json`), JSON.stringify(fixture, null, 2));
  console.log(`wrote ${name} — strain=${metrics.strainScore} stress=${metrics.stressAverage} spo2=${metrics.spo2Average}`);
}

function main() {
  const base: Fixture = JSON.parse(readFileSync(join(DIR, 'normal-ist.json'), 'utf8'));

  // 1. null-max-hr: strain function falls back to 190 default
  writeVariant('null-max-hr', base.input, (i) => {
    i.baseline.maxHeartRate = null;
  });

  // 2. empty-sensors: spo2/skinTemp/coreTemp paths take null branches
  writeVariant('empty-sensors', base.input, (i) => {
    i.sensorRecords = [];
  });

  // 3. single-sample: strain returns null (< 2 sample guard)
  writeVariant('single-sample', base.input, (i) => {
    i.samples = i.samples.slice(0, 1);
  });

  // 4. tz-utc: same data, but referenceDate computed in UTC
  writeVariant('tz-utc', base.input, (i) => {
    i.timeZone = 'UTC';
  });

  // 5. tz-ny: New York timezone (different calendar bounds, no DST in early Jan)
  writeVariant('tz-ny', base.input, (i) => {
    i.timeZone = 'America/New_York';
  });
}

main();
