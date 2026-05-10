/**
 * Passive VO2max estimate via the Uth–Sørensen–Overgaard–Pedersen
 * formula (Uth et al., Eur J Appl Physiol 2004):
 *
 *   VO2max ≈ 15 × HRmax / HRrest   (mL/kg/min)
 *
 * This is the simplest validated daily-passive estimator — accuracy is
 * inferior to a graded treadmill test but adequate as a trend signal.
 * Reference: PMID 14624296.
 *
 * WHOOP's published 3-tier system (passive, GPS-augmented, lab-anchored;
 * passive MAE 3.7 mL/kg/min on n=248) layers this with sport-specific
 * sub-maximal HR-vs-cadence regression. We start with tier 1 only.
 */
export function computeVo2MaxUth(
  restingHeartRate: number | null,
  maxHeartRate: number | null,
): number | null {
  if (restingHeartRate == null || restingHeartRate <= 0) return null;
  if (maxHeartRate == null || maxHeartRate <= 0) return null;
  const v = (15 * maxHeartRate) / restingHeartRate;
  // Plausible adult range: 15–80 mL/kg/min. Outside this, almost
  // certainly garbage maxHR; return null rather than display nonsense.
  if (v < 15 || v > 80) return null;
  return Math.round(v * 10) / 10;
}
