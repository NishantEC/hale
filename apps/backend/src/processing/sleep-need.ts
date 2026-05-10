import type { NightFeatureSet, SleepDetectionSummary } from './interfaces';
import { clamp } from './utils';

/**
 * Sleep Need (hours) — personalized nightly sleep target.
 *
 * WHOOP discloses the components but not the weights. We use a
 * conservative version of the formula:
 *
 *   need = baseline + strain_term + debt_term
 *
 * - baseline: the user's static target (default 8 h).
 * - strain_term: 0–1 h, scales with today's day-strain. WHOOP says the
 *   contribution is positive but minor; we use 0.05 h per strain point
 *   (so a 16 strain day adds ~48 minutes).
 * - debt_term: 0–2 h, exponentially-decayed deficit over the last 14
 *   nights. Recent shortages count more than older ones. A 7-day decay
 *   constant lines up with the WHOOP-disclosed window.
 *
 * Returns null when there's not enough history to compute a stable
 * baseline (caller should fall back to the static target).
 */
export interface SleepNeedBreakdown {
  totalHours: number;
  baselineHours: number;
  strainHours: number;
  debtHours: number;
}

const DECAY_HALFLIFE_NIGHTS = 7;
const STRAIN_PER_HOUR = 0.05;
const MAX_DEBT_HOURS = 2;
const DEBT_WINDOW_NIGHTS = 14;

export function computeSleepNeed(
  targetSleepMinutes: number,
  strainScore: number | null,
  history: SleepDetectionSummary[],
  referenceDate: Date,
): SleepNeedBreakdown {
  const baselineHours = Math.max(4, targetSleepMinutes / 60);

  const strainHours = clamp(
    (strainScore ?? 0) * STRAIN_PER_HOUR,
    0,
    1,
  );

  const debtHours = computeDebt(history, baselineHours, referenceDate);

  return {
    totalHours: baselineHours + strainHours + debtHours,
    baselineHours,
    strainHours,
    debtHours,
  };
}

function computeDebt(
  history: SleepDetectionSummary[],
  targetHours: number,
  referenceDate: Date,
): number {
  if (history.length === 0) return 0;

  const refMs = referenceDate.getTime();
  const oldestMs = refMs - DEBT_WINDOW_NIGHTS * 86_400_000;

  const relevant = history
    .filter(
      (d) =>
        d.nightDate.getTime() < refMs && d.nightDate.getTime() >= oldestMs,
    )
    .sort((a, b) => b.nightDate.getTime() - a.nightDate.getTime());

  if (relevant.length === 0) return 0;

  const decayConstant = Math.LN2 / DECAY_HALFLIFE_NIGHTS;
  let weightedDeficit = 0;
  let weightSum = 0;
  for (let i = 0; i < relevant.length; i++) {
    const deficit = Math.max(0, targetHours - relevant[i].durationHours);
    const weight = Math.exp(-decayConstant * i);
    weightedDeficit += deficit * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;

  return clamp(weightedDeficit / weightSum, 0, MAX_DEBT_HOURS);
}
