import { SignalSample, WellnessConfidence } from './interfaces';

export function sanitize(samples: SignalSample[]): SignalSample[] {
  return samples.filter(sample => {
    if (sample.heartRate < 35 || sample.heartRate > 210) return false;
    if (sample.ibiMs !== null && (sample.ibiMs < 250 || sample.ibiMs > 2000)) return false;
    if (sample.motionScore !== null && sample.motionScore > 0.65) return false;
    const quality = Math.max(0, Math.min(1, sample.qualityScore));
    if (quality < 0.35) return false;
    return true;
  }).map(sample => ({
    ...sample,
    qualityScore: Math.max(0, Math.min(1, sample.qualityScore)),
  }));
}

export function confidenceLevel(rawValue: number): WellnessConfidence {
  if (rawValue >= 0.75) return 'High';
  if (rawValue >= 0.45) return 'Medium';
  return 'Low';
}
