/**
 * HRV Frequency-Domain Analysis via Welch's method.
 *
 * Computes LF (0.04-0.15 Hz) and HF (0.15-0.40 Hz) power bands from
 * RR interval series using FFT-based power spectral density estimation.
 */

const MIN_RR_COUNT = 120;
const RESAMPLE_HZ = 4;
const SEGMENT_SIZE = 256;
const OVERLAP_FRACTION = 0.5;

const LF_LOW = 0.04;
const LF_HIGH = 0.15;
const HF_LOW = 0.15;
const HF_HIGH = 0.40;

export interface LfHfResult {
  lf: number;
  hf: number;
  lfHfRatio: number;
  totalPower: number;
}

/**
 * Compute LF/HF ratio from RR intervals in milliseconds.
 * Returns null if insufficient data (<120 intervals).
 */
export function computeLfHfRatio(rrIntervalsMs: number[]): LfHfResult | null {
  if (rrIntervalsMs.length < MIN_RR_COUNT) return null;

  // 1. Resample RR intervals to uniform 4 Hz using linear interpolation
  const resampled = resampleRR(rrIntervalsMs, RESAMPLE_HZ);
  if (resampled.length < SEGMENT_SIZE) return null;

  // 2. Welch PSD: segment, window, FFT, average
  const overlap = Math.floor(SEGMENT_SIZE * OVERLAP_FRACTION);
  const step = SEGMENT_SIZE - overlap;
  const hannWindow = makeHannWindow(SEGMENT_SIZE);
  const windowPowerSum = hannWindow.reduce((s, w) => s + w * w, 0);

  const psdAccum = new Float64Array(SEGMENT_SIZE / 2 + 1);
  let segmentCount = 0;

  for (let start = 0; start + SEGMENT_SIZE <= resampled.length; start += step) {
    const segment = new Float64Array(SEGMENT_SIZE);
    for (let i = 0; i < SEGMENT_SIZE; i++) {
      segment[i] = resampled[start + i] * hannWindow[i];
    }

    const { re, im } = fftRadix2(segment);
    for (let k = 0; k <= SEGMENT_SIZE / 2; k++) {
      psdAccum[k] += (re[k] * re[k] + im[k] * im[k]) / (RESAMPLE_HZ * windowPowerSum);
    }
    segmentCount++;
  }

  if (segmentCount === 0) return null;

  // Average across segments
  const freqResolution = RESAMPLE_HZ / SEGMENT_SIZE;
  let lf = 0;
  let hf = 0;
  let total = 0;

  for (let k = 0; k <= SEGMENT_SIZE / 2; k++) {
    const freq = k * freqResolution;
    const power = psdAccum[k] / segmentCount;

    if (freq >= LF_LOW && freq < LF_HIGH) lf += power * freqResolution;
    if (freq >= HF_LOW && freq < HF_HIGH) hf += power * freqResolution;
    total += power * freqResolution;
  }

  if (hf <= 0) return null;

  return {
    lf,
    hf,
    lfHfRatio: lf / hf,
    totalPower: total,
  };
}

/** Resample irregularly spaced RR intervals to uniform Hz via linear interpolation. */
function resampleRR(rrMs: number[], hz: number): Float64Array {
  // Cumulative time in seconds for each RR interval
  const times: number[] = [0];
  for (let i = 0; i < rrMs.length; i++) {
    times.push(times[i] + rrMs[i] / 1000);
  }

  const totalSeconds = times[times.length - 1];
  const sampleCount = Math.floor(totalSeconds * hz);
  const output = new Float64Array(sampleCount);
  const dt = 1 / hz;

  let rrIdx = 0;
  for (let i = 0; i < sampleCount; i++) {
    const t = i * dt;
    while (rrIdx < times.length - 2 && times[rrIdx + 1] < t) rrIdx++;

    const t0 = times[rrIdx];
    const t1 = times[rrIdx + 1];
    const v0 = rrMs[Math.max(0, rrIdx - 1)] ?? rrMs[0];
    const v1 = rrMs[Math.min(rrIdx, rrMs.length - 1)];

    const frac = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    output[i] = v0 + frac * (v1 - v0);
  }

  // Remove mean (detrend)
  let mean = 0;
  for (let i = 0; i < output.length; i++) mean += output[i];
  mean /= output.length;
  for (let i = 0; i < output.length; i++) output[i] -= mean;

  return output;
}

/** Hann window of given size. */
export function makeHannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** Radix-2 in-place FFT. Input length must be power of 2. */
export function fftRadix2(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = input.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  // Bit-reversal permutation
  for (let i = 0; i < n; i++) {
    re[bitReverse(i, Math.log2(n))] = input[i];
  }

  // Cooley-Tukey butterfly
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const wRe = Math.cos(angle * j);
        const wIm = Math.sin(angle * j);
        const tRe = re[i + j + halfSize] * wRe - im[i + j + halfSize] * wIm;
        const tIm = re[i + j + halfSize] * wIm + im[i + j + halfSize] * wRe;
        re[i + j + halfSize] = re[i + j] - tRe;
        im[i + j + halfSize] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
      }
    }
  }

  return { re, im };
}

export function bitReverse(x: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (x & 1);
    x >>= 1;
  }
  return result;
}
