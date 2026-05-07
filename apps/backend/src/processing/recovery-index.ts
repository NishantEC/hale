/**
 * Composite Recovery Index (0-100).
 *
 * Weighted combination of:
 * - HRV recovery (40%): RMSSD vs baseline
 * - Sleep quality (25%): duration, architecture, continuity
 * - Strain recovery (15%): inverse of previous day strain
 * - SpO2 (10%): deviation from 97% baseline
 * - Temperature deviation (10%): skin temp delta from baseline
 */

export interface RecoveryParams {
  hrvRmssd: number;
  baselineRmssd: number;
  lfHfRatio: number | null;
  prevDayStrain: number | null;
  spo2Average: number | null;
  skinTempDelta: number | null;
  architectureScore: number | null;
  sleepDurationHours: number;
  targetSleepMinutes: number;
}

export function computeRecoveryIndex(params: RecoveryParams): number {
  const {
    hrvRmssd, baselineRmssd, lfHfRatio,
    prevDayStrain, spo2Average, skinTempDelta,
    architectureScore, sleepDurationHours, targetSleepMinutes,
  } = params;

  // 1. HRV Recovery (40%)
  let hrvScore = 50;
  if (baselineRmssd > 0 && hrvRmssd > 0) {
    const ratio = hrvRmssd / baselineRmssd;
    // ratio > 1 = above baseline (good), < 1 = below (bad)
    hrvScore = clamp(50 + (ratio - 1) * 100, 0, 100);
  }
  // LF/HF bonus: low ratio = parasympathetic dominance (good recovery)
  if (lfHfRatio != null && lfHfRatio > 0) {
    const lfHfBonus = lfHfRatio < 1.5 ? 10 : lfHfRatio < 2.5 ? 0 : -10;
    hrvScore = clamp(hrvScore + lfHfBonus, 0, 100);
  }

  // 2. Sleep Quality (25%)
  const targetHours = targetSleepMinutes / 60;
  const durationRatio = targetHours > 0 ? sleepDurationHours / targetHours : 1;
  let sleepScore = clamp(durationRatio * 70, 0, 70); // Duration up to 70 points
  if (architectureScore != null) {
    sleepScore += (architectureScore / 100) * 30; // Architecture up to 30 points
  } else {
    sleepScore += 15; // Default middle value
  }
  sleepScore = clamp(sleepScore, 0, 100);

  // 3. Strain Recovery (15%)
  let strainScore = 70; // Default neutral
  if (prevDayStrain != null) {
    // Lower strain yesterday = better recovery
    // Strain scale: 0-21
    strainScore = clamp(100 - (prevDayStrain / 21) * 80, 0, 100);
  }

  // 4. SpO2 (10%)
  let spo2Score = 80;
  if (spo2Average != null) {
    // 97% = perfect, each 1% drop = -15 points
    spo2Score = clamp(100 - (97 - spo2Average) * 15, 0, 100);
  }

  // 5. Temperature (10%)
  let tempScore = 80;
  if (skinTempDelta != null) {
    // Small deviation from baseline is good
    const absDelta = Math.abs(skinTempDelta);
    tempScore = clamp(100 - absDelta * 50, 0, 100);
  }

  // Weighted combination
  const index = Math.round(
    hrvScore * 0.40 +
    sleepScore * 0.25 +
    strainScore * 0.15 +
    spo2Score * 0.10 +
    tempScore * 0.10,
  );

  return clamp(index, 0, 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
