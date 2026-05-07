/**
 * Respiratory Sinus Arrhythmia (RSA) computation.
 *
 * RSA measures the amplitude of heart rate variation synchronized
 * with breathing. Higher RSA indicates stronger vagal (parasympathetic) tone.
 */

const MIN_RR_COUNT = 60;

export interface RSAResult {
  rsaAmplitude: number; // Peak-to-trough amplitude in ms
}

/**
 * Compute RSA by measuring RR interval oscillation at respiratory frequency.
 *
 * Method: Bandpass the RR series around the respiratory frequency,
 * then measure peak-to-trough amplitude of the filtered signal.
 *
 * @param rrIntervalsMs - RR intervals in milliseconds
 * @param respRatePerMin - Respiratory rate in breaths per minute
 * @returns RSA result or null if insufficient data
 */
export function computeRSA(
  rrIntervalsMs: number[],
  respRatePerMin: number,
): RSAResult | null {
  if (rrIntervalsMs.length < MIN_RR_COUNT) return null;
  if (respRatePerMin <= 0 || respRatePerMin > 60) return null;

  // Respiratory frequency in Hz
  const respFreqHz = respRatePerMin / 60;

  // Bandpass filter RR intervals around respiratory frequency (±0.05 Hz)
  // Using a simple moving-average-based bandpass approach
  const filtered = bandpassFilter(rrIntervalsMs, respFreqHz);
  if (filtered.length < 10) return null;

  // Compute RSA amplitude as average peak-to-trough distance
  const { peaks, troughs } = findPeaksTroughs(filtered);
  if (peaks.length < 2 || troughs.length < 2) return null;

  // Average the peak-to-trough amplitudes
  const amplitudes: number[] = [];
  let pi = 0;
  let ti = 0;
  while (pi < peaks.length && ti < troughs.length) {
    amplitudes.push(Math.abs(filtered[peaks[pi]] - filtered[troughs[ti]]));
    if (pi < peaks.length - 1 && peaks[pi + 1] < (troughs[ti + 1] ?? Infinity)) {
      pi++;
    } else {
      ti++;
    }
    if (pi >= peaks.length - 1 && ti >= troughs.length - 1) break;
  }

  if (amplitudes.length === 0) return null;

  const rsaAmplitude = amplitudes.reduce((s, a) => s + a, 0) / amplitudes.length;

  return { rsaAmplitude };
}

/**
 * Simple bandpass filter using cascaded moving averages.
 * Lowpass at respFreq + 0.05 Hz, then highpass at respFreq - 0.05 Hz.
 */
function bandpassFilter(rr: number[], centerFreqHz: number): number[] {
  // Estimate sample rate from mean RR interval
  const meanRR = rr.reduce((s, v) => s + v, 0) / rr.length;
  const sampleRate = 1000 / meanRR; // Hz

  // Lowpass: moving average with window for (centerFreq + 0.05 Hz)
  const lpCutoff = centerFreqHz + 0.05;
  const lpWindow = Math.max(3, Math.round(sampleRate / lpCutoff / 2));
  const lowpassed = movingAverage(rr, lpWindow);

  // Highpass = original - lowpass(at lower frequency)
  const hpCutoff = Math.max(0.02, centerFreqHz - 0.05);
  const hpWindow = Math.max(5, Math.round(sampleRate / hpCutoff / 2));
  const veryLow = movingAverage(lowpassed, hpWindow);

  const result: number[] = [];
  for (let i = 0; i < Math.min(lowpassed.length, veryLow.length); i++) {
    result.push(lowpassed[i] - veryLow[i]);
  }
  return result;
}

function movingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= window) sum -= data[i - window];
    if (i >= window - 1) result.push(sum / window);
  }
  return result;
}

function findPeaksTroughs(data: number[]): { peaks: number[]; troughs: number[] } {
  const peaks: number[] = [];
  const troughs: number[] = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > data[i - 1] && data[i] > data[i + 1]) peaks.push(i);
    if (data[i] < data[i - 1] && data[i] < data[i + 1]) troughs.push(i);
  }
  return { peaks, troughs };
}
