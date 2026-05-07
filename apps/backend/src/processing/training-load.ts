/**
 * Training Load Ratio (Acute:Chronic Workload Ratio).
 *
 * Acute = 7-day EWMA of strain, Chronic = 28-day EWMA.
 * Ratio guides training intensity to avoid injury.
 */

export interface TrainingLoadResult {
  acuteLoad: number;
  chronicLoad: number;
  ratio: number;
  riskZone: 'low' | 'optimal' | 'high' | 'danger';
}

export function computeTrainingLoadRatio(
  dailyStrains: { date: Date; strain: number }[],
): TrainingLoadResult | null {
  if (dailyStrains.length < 7) return null;

  const sorted = [...dailyStrains].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // EWMA (Exponentially Weighted Moving Average)
  const acuteAlpha = 2 / (7 + 1); // 7-day smoothing
  const chronicAlpha = 2 / (28 + 1); // 28-day smoothing

  let acuteEwma = sorted[0].strain;
  let chronicEwma = sorted[0].strain;

  for (let i = 1; i < sorted.length; i++) {
    acuteEwma = acuteAlpha * sorted[i].strain + (1 - acuteAlpha) * acuteEwma;
    chronicEwma = chronicAlpha * sorted[i].strain + (1 - chronicAlpha) * chronicEwma;
  }

  const ratio = chronicEwma > 0.1 ? acuteEwma / chronicEwma : 1;

  let riskZone: TrainingLoadResult['riskZone'];
  if (ratio < 0.8) riskZone = 'low';
  else if (ratio <= 1.3) riskZone = 'optimal';
  else if (ratio <= 1.5) riskZone = 'high';
  else riskZone = 'danger';

  return {
    acuteLoad: Math.round(acuteEwma * 10) / 10,
    chronicLoad: Math.round(chronicEwma * 10) / 10,
    ratio: Math.round(ratio * 100) / 100,
    riskZone,
  };
}
