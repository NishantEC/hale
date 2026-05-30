import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { JournalEntry } from './journal-entry.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';

export type InsightMetric = 'sleep' | 'recovery' | 'hrv' | 'strain';

export type ImpactConfidence = 'low' | 'medium' | 'high';

export interface FactorImpact {
  factorTag: string;
  daysWith: number;
  daysWithout: number;
  meanWith: number;
  meanWithout: number;
  delta: number;
  helps: boolean;
  confidence: ImpactConfidence;
}

export interface MetricInsights {
  metric: InsightMetric;
  metricLabel: string;
  sampleDays: number;
  factors: FactorImpact[];
}

export interface InsightsViewModel {
  windowDays: number;
  totalDays: number;
  hasEnoughData: boolean;
  // Per master plan §4.10, "Calibrating · N days remaining" until we hit 14
  // nights of data. Surface that here so the frontend can render the
  // empty/calibrating state without a second round-trip.
  daysUntilReady: number;
  insights: MetricInsights[];
}

// The mean-delta correlator needs at least 3 days WITH the factor and 3
// days WITHOUT it to surface a result — anything below that is noise.
const MIN_SAMPLE_SIZE = 3;
// Minimum total tracked days before we even attempt insights.
const MIN_TOTAL_DAYS = 14;

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntry)
    private repo: Repository<JournalEntry>,
    @InjectRepository(DailyScore)
    private scoreRepo: Repository<DailyScore>,
    @InjectRepository(NightFeature)
    private nightRepo: Repository<NightFeature>,
    @InjectRepository(DailyMetric)
    private metricRepo: Repository<DailyMetric>,
  ) {}

  async buildExport(userId: string, windowDays = 90): Promise<{
    generatedAt: string;
    windowDays: number;
    journal: JournalEntry[];
    dailyScores: DailyScore[];
    nightFeatures: NightFeature[];
    dailyMetrics: DailyMetric[];
  }> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const [journal, dailyScores, nightFeatures, dailyMetrics] = await Promise.all([
      this.repo.find({
        where: { userId, timestamp: MoreThan(since) },
        order: { timestamp: 'ASC' },
      }),
      this.scoreRepo.find({
        where: { userId, dayDate: MoreThan(since) },
        order: { dayDate: 'ASC' },
      }),
      this.nightRepo.find({
        where: { userId, nightDate: MoreThan(since) },
        order: { nightDate: 'ASC' },
      }),
      this.metricRepo.find({
        where: { userId, dayDate: MoreThan(since) },
        order: { dayDate: 'ASC' },
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      journal,
      dailyScores,
      nightFeatures,
      dailyMetrics,
    };
  }

  async create(userId: string, data: { factorTag: string; intensity: number; note?: string; timestamp?: string }): Promise<JournalEntry> {
    const entry = this.repo.create({
      userId,
      factorTag: data.factorTag,
      intensity: data.intensity,
      note: data.note ?? '',
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    });
    return this.repo.save(entry);
  }

  async findByDate(userId: string, date: string): Promise<JournalEntry[]> {
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    return this.repo.find({
      where: { userId, timestamp: Between(start, end) },
      order: { timestamp: 'DESC' },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  // Mean-delta correlator: for each factor a user has logged at least
  // MIN_SAMPLE_SIZE times in the window, compute mean(metric|factor) vs
  // mean(metric|no factor). Return signed deltas the frontend can render
  // as horizontal bars anchored at 0 — hurts left / helps right.
  async buildInsights(userId: string, windowDays = 30): Promise<InsightsViewModel> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [entries, scores, nights, metrics] = await Promise.all([
      this.repo.find({
        where: { userId, timestamp: MoreThan(since) },
        order: { timestamp: 'ASC' },
      }),
      this.scoreRepo.find({
        where: { userId, dayDate: MoreThan(since) },
        order: { dayDate: 'ASC' },
      }),
      this.nightRepo.find({
        where: { userId, nightDate: MoreThan(since) },
        order: { nightDate: 'ASC' },
      }),
      this.metricRepo.find({
        where: { userId, dayDate: MoreThan(since) },
        order: { dayDate: 'ASC' },
      }),
    ]);

    // Tag → set of dayKeys the factor was logged on (YYYY-MM-DD).
    const factorDays = new Map<string, Set<string>>();
    for (const e of entries) {
      const dayKey = dayKey3(e.timestamp);
      if (!dayKey) continue;
      const set = factorDays.get(e.factorTag) ?? new Set<string>();
      set.add(dayKey);
      factorDays.set(e.factorTag, set);
    }

    const dayKeys = new Set<string>()
    for (const s of scores) {
      const k = dayKey3(s.dayDate)
      if (k) dayKeys.add(k)
    }
    const totalDays = dayKeys.size;

    if (totalDays < MIN_TOTAL_DAYS) {
      return {
        windowDays,
        totalDays,
        hasEnoughData: false,
        daysUntilReady: Math.max(0, MIN_TOTAL_DAYS - totalDays),
        insights: [],
      };
    }

    const sleepByDay = new Map<string, number>();
    const recoveryByDay = new Map<string, number>();
    const hrvByDay = new Map<string, number>();
    const strainByDay = new Map<string, number>();
    for (const s of scores) {
      const k = dayKey3(s.dayDate);
      if (!k) continue;
      if (s.sleepScore != null) sleepByDay.set(k, s.sleepScore);
      if (s.dailyBalance != null) recoveryByDay.set(k, s.dailyBalance);
    }
    for (const n of nights) {
      const k = dayKey3(n.nightDate);
      if (!k) continue;
      if (n.rmssd != null && n.rmssd > 0) hrvByDay.set(k, n.rmssd);
    }
    for (const m of metrics) {
      const k = dayKey3(m.dayDate);
      if (!k) continue;
      if (m.strainScore != null) strainByDay.set(k, m.strainScore);
    }

    const allDays = Array.from(dayKeys);

    const insights: MetricInsights[] = [
      this.metricInsights('sleep', 'Sleep score', sleepByDay, factorDays, allDays, true),
      this.metricInsights('recovery', 'Recovery', recoveryByDay, factorDays, allDays, true),
      this.metricInsights('hrv', 'HRV (ms)', hrvByDay, factorDays, allDays, true),
      this.metricInsights('strain', 'Strain', strainByDay, factorDays, allDays, false),
    ];

    return {
      windowDays,
      totalDays,
      hasEnoughData: true,
      daysUntilReady: 0,
      insights,
    };
  }

  private metricInsights(
    metric: InsightMetric,
    metricLabel: string,
    metricByDay: Map<string, number>,
    factorDays: Map<string, Set<string>>,
    allDays: string[],
    higherIsBetter: boolean,
  ): MetricInsights {
    const factors: FactorImpact[] = [];

    for (const [tag, daysWithSet] of factorDays.entries()) {
      const withVals: number[] = [];
      const withoutVals: number[] = [];

      for (const day of allDays) {
        const value = metricByDay.get(day);
        if (value == null) continue;
        if (daysWithSet.has(day)) withVals.push(value);
        else withoutVals.push(value);
      }

      if (withVals.length < MIN_SAMPLE_SIZE) continue;
      if (withoutVals.length < MIN_SAMPLE_SIZE) continue;

      const meanWith = mean(withVals);
      const meanWithout = mean(withoutVals);
      const delta = meanWith - meanWithout;
      // For metrics where higher = better (sleep, recovery, hrv), positive
      // delta means the factor helps. For strain, "helps" is intentionally
      // less meaningful — render as raw delta and let the UI decide framing.
      const helps = higherIsBetter ? delta > 0 : delta < 0;

      // Sample-size-derived confidence. Honest enough for v1 — eventually
      // upgrade to a real t-test / effect-size with CI, but for now bin by
      // count so the UI can render a "high / medium / low" badge.
      const minSamples = Math.min(withVals.length, withoutVals.length);
      const confidence: ImpactConfidence =
        minSamples >= 10 ? 'high' : minSamples >= 5 ? 'medium' : 'low';

      factors.push({
        factorTag: tag,
        daysWith: withVals.length,
        daysWithout: withoutVals.length,
        meanWith: round1(meanWith),
        meanWithout: round1(meanWithout),
        delta: round1(delta),
        helps,
        confidence,
      });
    }

    // Sort by confidence-weighted impact: |delta| × weight (high=1.0,
    // medium=0.7, low=0.4). Surfaces high-confidence wins over barely-
    // sampled high-delta noise.
    const weightFor = (c: ImpactConfidence) =>
      c === 'high' ? 1.0 : c === 'medium' ? 0.7 : 0.4;
    factors.sort(
      (a, b) =>
        Math.abs(b.delta) * weightFor(b.confidence) -
        Math.abs(a.delta) * weightFor(a.confidence),
    );

    return {
      metric,
      metricLabel,
      sampleDays: allDays.length,
      factors,
    };
  }
}

function dayKey3(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
