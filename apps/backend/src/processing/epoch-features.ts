import type { HistoricalSensorRecord, EpochFeature } from './interfaces';
import { average, standardDeviation, median } from './utils';
import { computeLfHfRatio } from './hrv-frequency';
import { computeRSA } from './respiratory-sinus-arrhythmia';

const EPOCH_SECONDS = 30;
const GRAVITY_STILL_THRESHOLD = 0.01;
const FEATURE_COUNT = 28;

export function extractEpochFeatures(
  records: HistoricalSensorRecord[],
  bedtime: Date,
  wakeTime: Date,
  nightMedianHR: number,
  nightBaselineTemp?: number,
): EpochFeature[] {
  const sorted = records
    .filter(
      (r) =>
        r.timestamp.getTime() >= bedtime.getTime() &&
        r.timestamp.getTime() <= wakeTime.getTime(),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (sorted.length < EPOCH_SECONDS) return [];

  // Compute night-level skin temperature baseline if not provided
  const nightTempBaseline =
    nightBaselineTemp ??
    (() => {
      const temps = sorted
        .map((r) => r.skinTempRaw)
        .filter((v): v is number => v != null && v >= 100);
      return temps.length > 0 ? median(temps) * 0.04 : NaN;
    })();

  const startMs = bedtime.getTime();
  const endMs = wakeTime.getTime();
  // Use ceil to include the epoch containing wakeTime
  const totalEpochs = Math.ceil((endMs - startMs) / (EPOCH_SECONDS * 1000));

  const features: EpochFeature[] = [];

  for (let i = 0; i < totalEpochs; i++) {
    const epochStart = startMs + i * EPOCH_SECONDS * 1000;
    const epochEnd = epochStart + EPOCH_SECONDS * 1000;

    const windowRecords = sorted.filter(
      (r) =>
        r.timestamp.getTime() >= epochStart &&
        r.timestamp.getTime() < epochEnd,
    );

    if (windowRecords.length === 0) continue;

    const epochTimestamp = new Date(epochStart + (EPOCH_SECONDS * 1000) / 2);
    features.push(
      computeEpochFeature(windowRecords, epochTimestamp, nightMedianHR, nightTempBaseline),
    );
  }

  return features;
}

function computeEpochFeature(
  records: HistoricalSensorRecord[],
  timestamp: Date,
  nightMedianHR: number,
  nightTempBaseline: number,
): EpochFeature {
  // HR features
  const heartRates = records.map((r) => r.heartRate).filter((v) => v > 0);
  const hrMean = heartRates.length > 0 ? average(heartRates) : NaN;
  const hrStd = heartRates.length >= 2 ? standardDeviation(heartRates) : 0;
  const hrMin = heartRates.length > 0 ? Math.min(...heartRates) : NaN;
  const hrMax = heartRates.length > 0 ? Math.max(...heartRates) : NaN;
  const hrDeltaFromBaseline =
    nightMedianHR > 0 && !isNaN(hrMean)
      ? (hrMean - nightMedianHR) / nightMedianHR
      : NaN;

  // Motion features from gravity deltas
  const gravityDeltas = computeGravityDeltas(records);
  const motionMagnitude =
    gravityDeltas.length > 0 ? average(gravityDeltas) : NaN;
  const motionStd =
    gravityDeltas.length >= 2 ? standardDeviation(gravityDeltas) : 0;
  const motionCount =
    gravityDeltas.length > 0
      ? gravityDeltas.filter((d) => d > GRAVITY_STILL_THRESHOLD).length
      : 0;
  const stillFraction =
    gravityDeltas.length > 0
      ? gravityDeltas.filter((d) => d <= GRAVITY_STILL_THRESHOLD).length /
        gravityDeltas.length
      : NaN;

  // HRV features
  const ibis = records
    .map((r) => r.rrAverageMs)
    .filter((v): v is number => v != null && v > 0);
  const rmssd = computeRMSSD(ibis);
  const sdnn = ibis.length >= 2 ? standardDeviation(ibis) : NaN;
  const rrMean = ibis.length > 0 ? average(ibis) : NaN;

  // Respiratory features. respRateRaw is a Q8.8 fixed-point value
  // (high byte = breaths/min integer part, low byte = fractional/flag).
  // Dividing by 256 yields breaths-per-minute. Sleep range is ~7-16,
  // awake range ~12-20; clamp to [4, 30] to drop sensor garbage.
  const respValues = records
    .map((r) => (r.respRateRaw != null ? r.respRateRaw / 256 : null))
    .filter((v): v is number => v != null && v >= 4 && v <= 30);
  const respiratoryRate = respValues.length > 0 ? average(respValues) : NaN;
  const respiratoryStd =
    respValues.length >= 2 ? standardDeviation(respValues) : NaN;

  // SpO2 (Beer-Lambert ratio)
  const spo2 = computeSpO2(records);

  // Skin temperature
  const tempValues = records
    .map((r) => r.skinTempRaw)
    .filter((v): v is number => v != null && v >= 100);
  const skinTemp =
    tempValues.length > 0 ? average(tempValues) * 0.04 : NaN;
  const skinTempDelta =
    !isNaN(skinTemp) && !isNaN(nightTempBaseline)
      ? skinTemp - nightTempBaseline
      : NaN;

  // Clock features (circadian encoding)
  const hour =
    timestamp.getUTCHours() +
    timestamp.getUTCMinutes() / 60 +
    timestamp.getUTCSeconds() / 3600;
  const clockSin = Math.sin((2 * Math.PI * hour) / 24);
  const clockCos = Math.cos((2 * Math.PI * hour) / 24);

  // Skin contact
  const contactValues = records.map((r) => r.skinContact);
  const skinContact =
    contactValues.every((c) => c === false) ? 0 : 1;

  // HRV frequency domain (LF/HF ratio)
  const lfHfResult = computeLfHfRatio(ibis);
  const lfPower = lfHfResult?.lf ?? NaN;
  const hfPower = lfHfResult?.hf ?? NaN;
  const lfHfRatio = lfHfResult?.lfHfRatio ?? NaN;

  // Respiratory sinus arrhythmia
  const rsaResult = computeRSA(ibis, respiratoryRate);
  const rsaAmplitude = rsaResult?.rsaAmplitude ?? NaN;

  // Ambient light (higher = more interference)
  const ambientValues = records
    .map((r) => r.ambientLight)
    .filter((v): v is number => v != null);
  const ambientLightMean = ambientValues.length > 0 ? average(ambientValues) : 0;

  // PPG confidence from green channel (coefficient of variation inverted)
  const ppgGreenValues = records
    .map((r) => r.ppgGreen)
    .filter((v): v is number => v != null && v > 0);
  const ppgConfidence = (() => {
    if (ppgGreenValues.length < 2) return NaN;
    const mean = average(ppgGreenValues);
    if (mean <= 0) return NaN;
    const cv = standardDeviation(ppgGreenValues) / mean;
    return Math.max(0, Math.min(1, 1 - cv));
  })();

  // Device signal quality index (normalized 0-1)
  const sqValues = records
    .map((r) => r.signalQuality)
    .filter((v): v is number => v != null && v >= 0);
  const deviceSignalQuality = sqValues.length > 0 ? average(sqValues) / 100 : NaN;

  // Signal completeness
  const featureValues = [
    hrMean, hrStd, hrMin, hrMax, hrDeltaFromBaseline,
    motionMagnitude, motionStd, motionCount, stillFraction,
    rmssd, sdnn, rrMean,
    respiratoryRate, respiratoryStd,
    spo2, skinTemp, skinTempDelta,
    clockSin, clockCos, skinContact,
    ambientLightMean, ppgConfidence, deviceSignalQuality,
    lfPower, hfPower, lfHfRatio, rsaAmplitude,
  ];
  const nonNanCount = featureValues.filter((v) => !isNaN(v)).length + 1; // +1 for signalCompleteness itself
  const signalCompleteness = nonNanCount / FEATURE_COUNT;

  return {
    timestamp,
    hrMean,
    hrStd,
    hrMin,
    hrMax,
    hrDeltaFromBaseline,
    motionMagnitude,
    motionStd,
    motionCount,
    stillFraction,
    rmssd,
    sdnn,
    rrMean,
    respiratoryRate,
    respiratoryStd,
    spo2,
    skinTemp,
    skinTempDelta,
    clockSin,
    clockCos,
    skinContact,
    signalCompleteness,
    ambientLightMean,
    ppgConfidence,
    deviceSignalQuality,
    lfPower,
    hfPower,
    lfHfRatio,
    rsaAmplitude,
  };
}

function computeGravityDeltas(
  records: HistoricalSensorRecord[],
): number[] {
  const deltas: number[] = [];
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const curr = records[i];
    if (
      prev.gravityX != null &&
      prev.gravityY != null &&
      prev.gravityZ != null &&
      curr.gravityX != null &&
      curr.gravityY != null &&
      curr.gravityZ != null
    ) {
      const dx = curr.gravityX - prev.gravityX;
      const dy = curr.gravityY - prev.gravityY;
      const dz = curr.gravityZ - prev.gravityZ;
      deltas.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    } else {
      deltas.push(1.0); // Missing data = assume motion (reference behavior)
    }
  }
  return deltas;
}

function computeRMSSD(ibis: number[]): number {
  if (ibis.length < 2) return NaN;
  let sumSquaredDiffs = 0;
  for (let i = 1; i < ibis.length; i++) {
    const diff = ibis[i] - ibis[i - 1];
    sumSquaredDiffs += diff * diff;
  }
  return Math.sqrt(sumSquaredDiffs / (ibis.length - 1));
}

function computeSpO2(records: HistoricalSensorRecord[]): number {
  const red = records
    .map((r) => r.spo2Red)
    .filter((v): v is number => v != null && v > 0);
  const ir = records
    .map((r) => r.spo2IR)
    .filter((v): v is number => v != null && v > 0);

  if (red.length < 2 || ir.length < 2) return NaN;

  const acRed = standardDeviation(red);
  const dcRed = average(red);
  const acIR = standardDeviation(ir);
  const dcIR = average(ir);

  if (dcRed <= 0 || dcIR <= 0 || acRed <= 0 || acIR <= 0) return NaN;

  const ratio = (acRed / dcRed) / (acIR / dcIR);
  return Math.max(70, Math.min(100, 110.0 - 25.0 * ratio));
}
