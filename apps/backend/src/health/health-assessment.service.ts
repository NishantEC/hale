import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import {
  HealthAssessment,
  HealthspanContributor,
} from './entities/health-assessment.entity.js';
import { UserProfile } from './entities/user-profile.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { HealthkitDailySummary } from '../activity/entities/healthkit-daily-summary.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import {
  aggregateNoopAge,
  chronologicalAge,
  coachingFor,
  computeContributors,
  ContributorInput,
  METRIC_SPECS,
  paceOfAging,
} from '../processing/healthspan.js';
import { computeVo2MaxUth } from '../processing/vo2max.js';

@Injectable()
export class HealthAssessmentService {
  private readonly logger = new Logger(HealthAssessmentService.name);

  constructor(
    @InjectRepository(HealthAssessment)
    private readonly assessmentRepo: Repository<HealthAssessment>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(NightFeature)
    private readonly nightFeatureRepo: Repository<NightFeature>,
    @InjectRepository(SleepDetection)
    private readonly sleepDetectionRepo: Repository<SleepDetection>,
    @InjectRepository(DailyMetric)
    private readonly dailyMetricRepo: Repository<DailyMetric>,
    @InjectRepository(HealthkitDailySummary)
    private readonly healthkitSummaryRepo: Repository<HealthkitDailySummary>,
    @InjectRepository(BaselineProfile)
    private readonly baselineRepo: Repository<BaselineProfile>,
  ) {}

  /**
   * Compute and persist this week's Healthspan assessment for `userId`.
   * Returns null when the user has not set dateOfBirth (the screen
   * shows an empty state in that case).
   */
  async computeWeekly(userId: string, referenceDate: Date): Promise<HealthAssessment | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    const age = chronologicalAge(profile?.dateOfBirth ?? null, referenceDate);
    if (age == null) return null;

    const weekStart = startOfWeek(referenceDate);
    const thirtyDayStart = new Date(weekStart.getTime() - 30 * 86_400_000);
    const sixMonthStart = new Date(weekStart.getTime() - 183 * 86_400_000);

    const [nightFeatures, sleepDetections, dailyMetrics, hkSummaries, baseline] = await Promise.all([
      this.nightFeatureRepo.find({
        where: { userId, nightDate: Between(sixMonthStart, weekStart) },
      }),
      this.sleepDetectionRepo.find({
        where: { userId, nightDate: Between(sixMonthStart, weekStart) },
      }),
      this.dailyMetricRepo.find({
        where: { userId, dayDate: Between(sixMonthStart, weekStart) },
      }),
      this.healthkitSummaryRepo.find({
        where: { userId, dayDate: Between(toDateOnly(sixMonthStart), toDateOnly(weekStart)) },
      }),
      this.baselineRepo.findOne({ where: { userId } }),
    ]);

    const inputs = this.buildContributorInputs({
      nightFeatures,
      sleepDetections,
      dailyMetrics,
      hkSummaries,
      baseline,
      thirtyDayStart,
      sixMonthStart,
      weekStart,
    });

    const contributors = computeContributors(inputs);
    const noopAge = aggregateNoopAge(age, contributors);

    const prior = await this.assessmentRepo.findOne({
      where: { userId },
      order: { weekStart: 'DESC' },
    });
    const pace = paceOfAging(
      noopAge,
      weekStart,
      prior
        ? { noopAge: prior.noopAge, weekStart: new Date(prior.weekStart) }
        : null,
    );
    const coaching = coachingFor(pace, age - noopAge);

    const contributorsRow: HealthspanContributor[] = contributors.map((c) => {
      const spec = METRIC_SPECS.find((s) => s.key === c.key);
      return {
        key: c.key,
        label: c.label,
        section: c.section,
        thirtyDayValue: c.thirtyDayValue,
        sixMonthValue: c.sixMonthValue,
        unitsLabel: spec?.unitsLabel ?? '',
        axisLo: spec?.axisLo ?? 0,
        axisHi: spec?.axisHi ?? 100,
        direction: spec?.direction ?? 'higher',
        impactYears: c.impactYears,
      };
    });

    const weekStartIso = toDateOnly(weekStart);
    const existing = await this.assessmentRepo.findOne({
      where: { userId, weekStart: weekStartIso },
    });
    const row =
      existing ??
      this.assessmentRepo.create({ userId, weekStart: weekStartIso });
    row.chronologicalAge = age;
    row.noopAge = noopAge;
    row.paceOfAging = pace;
    row.contributors = contributorsRow;
    row.coachingTitle = coaching.title;
    row.coachingBody = coaching.body;
    return this.assessmentRepo.save(row);
  }

  async getHistory(userId: string, limitWeeks = 12): Promise<HealthAssessment[]> {
    return this.assessmentRepo.find({
      where: { userId },
      order: { weekStart: 'DESC' },
      take: limitWeeks,
    });
  }

  async getForWeek(userId: string, weekStart: Date): Promise<HealthAssessment | null> {
    return this.assessmentRepo.findOne({
      where: { userId, weekStart: toDateOnly(weekStart) },
    });
  }

  async setProfile(
    userId: string,
    patch: Partial<Pick<UserProfile, 'dateOfBirth' | 'biologicalSex' | 'heightCm' | 'weightKg'>>,
  ): Promise<UserProfile> {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    const entity = existing ?? this.profileRepo.create({ userId });
    if (patch.dateOfBirth !== undefined) entity.dateOfBirth = patch.dateOfBirth;
    if (patch.biologicalSex !== undefined) entity.biologicalSex = patch.biologicalSex;
    if (patch.heightCm !== undefined) entity.heightCm = patch.heightCm;
    if (patch.weightKg !== undefined) entity.weightKg = patch.weightKg;
    return this.profileRepo.save(entity);
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  // --- internals --------------------------------------------------

  private buildContributorInputs(args: {
    nightFeatures: NightFeature[];
    sleepDetections: SleepDetection[];
    dailyMetrics: DailyMetric[];
    hkSummaries: HealthkitDailySummary[];
    baseline: BaselineProfile | null;
    thirtyDayStart: Date;
    sixMonthStart: Date;
    weekStart: Date;
  }): Record<string, ContributorInput> {
    const { nightFeatures, sleepDetections, dailyMetrics, hkSummaries, baseline, thirtyDayStart, weekStart } = args;

    const inWindow = <T extends { nightDate?: Date; dayDate?: Date | string }>(
      rows: T[],
      from: Date,
      to: Date,
    ): T[] =>
      rows.filter((r) => {
        const t = new Date((r.nightDate ?? r.dayDate) as Date | string);
        return t >= from && t <= to;
      });

    const meanOf = (values: (number | null | undefined)[]): number | null => {
      const v = values.filter((x): x is number => x != null && Number.isFinite(x));
      if (v.length === 0) return null;
      return v.reduce((a, b) => a + b, 0) / v.length;
    };

    const consistency30 = meanOf(
      inWindow(dailyMetrics, thirtyDayStart, weekStart).map((m) => m.sleepConsistencyScore),
    );
    const consistency6mo = meanOf(dailyMetrics.map((m) => m.sleepConsistencyScore));

    const hours30 = meanOf(
      inWindow(sleepDetections, thirtyDayStart, weekStart).map((d) => d.durationHours),
    );
    const hours6mo = meanOf(sleepDetections.map((d) => d.durationHours));

    const steps30 = meanOf(
      inWindow(hkSummaries, thirtyDayStart, weekStart).map((h) => h.steps),
    );
    const steps6mo = meanOf(hkSummaries.map((h) => h.steps));

    const rhr30 = meanOf(
      inWindow(nightFeatures, thirtyDayStart, weekStart).map((n) => n.restingHeartRate),
    );
    const rhr6mo = meanOf(nightFeatures.map((n) => n.restingHeartRate));

    const vo2max30 =
      rhr30 != null
        ? computeVo2MaxUth(rhr30, baseline?.maxHeartRate ?? null)
        : null;
    const vo2max6mo =
      rhr6mo != null
        ? computeVo2MaxUth(rhr6mo, baseline?.maxHeartRate ?? null)
        : null;

    // HR-zone time-in-zone is not yet computed; surface as null until #11
    // (improved auto-detect) lands. Placeholder entries keep the bars
    // visible but with no impact.
    return {
      sleepConsistency: {
        thirtyDayValue: consistency30,
        sixMonthValue: consistency6mo,
      },
      hoursOfSleep: { thirtyDayValue: hours30, sixMonthValue: hours6mo },
      hrZones1to3: { thirtyDayValue: null, sixMonthValue: null },
      hrZones4to5: { thirtyDayValue: null, sixMonthValue: null },
      stepsDaily: { thirtyDayValue: steps30, sixMonthValue: steps6mo },
      strengthActivity: { thirtyDayValue: null, sixMonthValue: null },
      vo2max: { thirtyDayValue: vo2max30, sixMonthValue: vo2max6mo },
      rhr: { thirtyDayValue: rhr30, sixMonthValue: rhr6mo },
    };
  }
}

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday-start
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
