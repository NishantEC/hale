/**
 * Healthspan hazard model — converts per-metric values into estimated
 * impact-on-biological-age in years.
 *
 * v0: linear-piecewise hazard slopes per metric, anchored to published
 * longevity literature where possible (Cooper Institute, Topol Lab,
 * Plews/Laursen HRV). WHOOP doesn't publish its slopes — see
 * research/whoop-features-deep-dive.md §1.3.
 *
 * Each per-metric impact is the years-of-biological-age **change vs.
 * the reference value for the user's chronological age**. Positive
 * means older, negative means younger.
 */

export type HealthspanSection = 'Sleep' | 'Strain' | 'Fitness';

export interface MetricSpec {
  key: string;
  label: string;
  section: HealthspanSection;
  unitsLabel: string;
  axisLo: number;
  axisHi: number;
  direction: 'higher' | 'lower';
  /** Reference value at which impact is zero (population norm). */
  referenceValue: number;
  /**
   * Years-of-age change per one unit of metric deviation in the
   * "improving" direction (negative number — improvement reduces age).
   * Asymmetric: penalty for being below reference is the same slope.
   */
  yearsPerUnit: number;
  /** Cap on absolute impact, years. */
  maxAbsImpact: number;
}

export const METRIC_SPECS: MetricSpec[] = [
  {
    key: 'sleepConsistency',
    label: 'Sleep Consistency',
    section: 'Sleep',
    unitsLabel: '%',
    axisLo: 40,
    axisHi: 100,
    direction: 'higher',
    referenceValue: 70,
    // Each +1% above 70 ≈ −0.02 years; each −1% below 70 ≈ +0.02 years.
    yearsPerUnit: -0.02,
    maxAbsImpact: 2.5,
  },
  {
    key: 'hoursOfSleep',
    label: 'Hours of Sleep',
    section: 'Sleep',
    unitsLabel: 'h',
    axisLo: 5,
    axisHi: 8,
    direction: 'higher',
    referenceValue: 7.5,
    yearsPerUnit: -0.6,
    maxAbsImpact: 2.0,
  },
  {
    key: 'hrZones1to3',
    label: 'Time in HR Zones 1-3 (weekly)',
    section: 'Strain',
    unitsLabel: 'h',
    axisLo: 0,
    axisHi: 3,
    direction: 'higher',
    referenceValue: 1.5,
    yearsPerUnit: -0.3,
    maxAbsImpact: 1.5,
  },
  {
    key: 'hrZones4to5',
    label: 'Time in HR Zones 4-5 (weekly)',
    section: 'Strain',
    unitsLabel: 'h',
    axisLo: 0,
    axisHi: 1,
    direction: 'higher',
    referenceValue: 0.5,
    yearsPerUnit: -1.5,
    maxAbsImpact: 2.0,
  },
  {
    key: 'stepsDaily',
    label: 'Steps (daily avg)',
    section: 'Strain',
    unitsLabel: 'steps',
    axisLo: 0,
    axisHi: 16000,
    direction: 'higher',
    referenceValue: 8000,
    // Per Lee et al. 2019 (women ≥40): ~−0.6 years per 2,000 daily steps.
    yearsPerUnit: -0.0003,
    maxAbsImpact: 2.0,
  },
  {
    key: 'strengthActivity',
    label: 'Strength Activity (weekly)',
    section: 'Strain',
    unitsLabel: 'h',
    axisLo: 0,
    axisHi: 5,
    direction: 'higher',
    referenceValue: 1.5,
    yearsPerUnit: -1.0,
    maxAbsImpact: 2.5,
  },
  {
    key: 'vo2max',
    label: 'VO₂ Max',
    section: 'Fitness',
    unitsLabel: 'ml/kg/min',
    axisLo: 15,
    axisHi: 70,
    direction: 'higher',
    referenceValue: 38,
    // Cooper Institute: each 1 MET (~3.5 ml/kg/min) ≈ 1.5 years.
    yearsPerUnit: -0.43,
    maxAbsImpact: 5.0,
  },
  {
    key: 'rhr',
    label: 'Resting Heart Rate',
    section: 'Fitness',
    unitsLabel: 'bpm',
    axisLo: 40,
    axisHi: 80,
    direction: 'lower',
    referenceValue: 65,
    // Cooper longitudinal: each 5 bpm RHR reduction ≈ 0.5 years.
    // Direction=lower so slope is positive (higher RHR = older).
    yearsPerUnit: 0.1,
    maxAbsImpact: 3.0,
  },
];

export interface ContributorInput {
  thirtyDayValue: number | null;
  sixMonthValue: number | null;
}

export interface ComputedContributor {
  key: string;
  label: string;
  section: HealthspanSection;
  thirtyDayValue: number | null;
  sixMonthValue: number | null;
  unitsLabel: string;
  axisLo: number;
  axisHi: number;
  direction: 'higher' | 'lower';
  impactYears: number;
}

/**
 * Compute the impact-in-years of a single metric. Uses the 30-day
 * value when present, otherwise falls back to the 6-month value.
 * Returns 0 impact when neither is available.
 */
export function impactYearsFor(
  spec: MetricSpec,
  thirtyDay: number | null,
  sixMonth: number | null,
): number {
  const value = thirtyDay ?? sixMonth;
  if (value == null || !Number.isFinite(value)) return 0;
  const deviation = value - spec.referenceValue;
  const raw = spec.yearsPerUnit * deviation;
  return Math.max(-spec.maxAbsImpact, Math.min(spec.maxAbsImpact, raw));
}

/** Compute all per-metric impacts. */
export function computeContributors(
  inputs: Record<string, ContributorInput>,
): ComputedContributor[] {
  return METRIC_SPECS.map((spec) => {
    const input = inputs[spec.key] ?? { thirtyDayValue: null, sixMonthValue: null };
    return {
      key: spec.key,
      label: spec.label,
      section: spec.section,
      thirtyDayValue: input.thirtyDayValue,
      sixMonthValue: input.sixMonthValue,
      unitsLabel: spec.unitsLabel,
      axisLo: spec.axisLo,
      axisHi: spec.axisHi,
      direction: spec.direction,
      impactYears: impactYearsFor(spec, input.thirtyDayValue, input.sixMonthValue),
    };
  });
}

/**
 * Aggregate per-metric impacts into a single noopAge.
 *   noopAge = chronologicalAge + sum(impacts)
 * Sum is bounded so wild outliers can't flip the user's apparent age by
 * more than ±15 years.
 */
export function aggregateNoopAge(
  chronologicalAge: number,
  contributors: ComputedContributor[],
): number {
  const sumImpact = contributors.reduce((s, c) => s + c.impactYears, 0);
  const bounded = Math.max(-15, Math.min(15, sumImpact));
  return Math.max(0, chronologicalAge + bounded);
}

/**
 * Pace of Aging: relative rate of biological-age change vs the
 * chronological clock. 1.0x = aging at chronological speed.
 *
 *   pace = 1 + (Δ noopAge per week) / (1/52)
 *        = 1 + 52 × (noopAge_this - noopAge_prev) / (week_gap_in_weeks)
 *
 * Returns null when there's no prior assessment.
 */
export function paceOfAging(
  thisAge: number,
  thisWeekStart: Date,
  prior: { noopAge: number; weekStart: Date } | null,
): number | null {
  if (!prior) return null;
  const weekGap =
    (thisWeekStart.getTime() - prior.weekStart.getTime()) /
    (7 * 86_400_000);
  if (weekGap <= 0) return null;
  const delta = thisAge - prior.noopAge;
  const pace = 1 + (52 * delta) / Math.max(1, weekGap);
  // Clamp to a sane range — extreme noisy weeks shouldn't claim 10x.
  return Math.max(-1, Math.min(3, pace));
}

/** Coaching block selector based on the Pace bucket. */
export function coachingFor(
  pace: number | null,
  noopAgeYounger: number,
): { title: string; body: string } {
  if (pace == null) {
    return {
      title: 'Building Your Baseline',
      body:
        'We need a few more weeks of data to estimate your Pace of Aging. Keep wearing the strap and your numbers will sharpen.',
    };
  }
  if (pace <= 0.9) {
    return {
      title: 'Steady and Healthy',
      body:
        noopAgeYounger > 0
          ? `Your noop Age is ${noopAgeYounger.toFixed(1)} years younger and your Pace of Aging is slow. You're doing well — continue your current habits to maintain this trajectory.`
          : "Your Pace of Aging is slow. Keep doing what you're doing — the trend is on your side.",
    };
  }
  if (pace <= 1.1) {
    return {
      title: 'On Track',
      body:
        'Your Pace of Aging is matching the chronological clock. Small improvements in sleep consistency or weekly cardio can move the needle.',
    };
  }
  if (pace <= 1.5) {
    return {
      title: 'Worth Watching',
      body:
        'Your Pace of Aging has nudged above 1.0x. Look at the per-metric breakdown below — the items in amber are the biggest levers.',
    };
  }
  return {
    title: 'Small Steps, Big Impact',
    body:
      'Your Pace of Aging is elevated this week. Focus on the highest-impact metric below first — small consistent changes compound quickly.',
  };
}

/**
 * Years between dateOfBirth and the supplied reference date.
 * Returns null if dateOfBirth is missing or in the future.
 */
export function chronologicalAge(
  dateOfBirth: string | null,
  referenceDate: Date,
): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const ageMs = referenceDate.getTime() - dob.getTime();
  if (ageMs < 0) return null;
  return ageMs / (365.25 * 86_400_000);
}
