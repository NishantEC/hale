import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';

import { JournalEntry } from '../journal/journal-entry.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import {
  DailyWellnessScore,
  JournalFactorEntry,
  JournalSleepCorrelation,
  SleepDetectionSummary,
  SleepStageSummary,
  SleepTypicalRanges,
} from '../processing/interfaces.js';
import { journalSleepCorrelations } from '../processing/journal-correlations.js';
import { computeSleepNeed } from '../processing/sleep-need.js';
import { computeSleepScoreForNight } from '../processing/sleep-score.js';
import { computeVo2MaxUth } from '../processing/vo2max.js';
import { computeTypicalRanges } from '../processing/typical-ranges.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { UpdateSleepPlanDto } from './dto/update-sleep-plan.dto.js';
import { ActivityDetection } from '../activity/entities/activity-detection.entity.js';
import { deltaVsWeek } from './delta.js';
import {
  calendarDayBounds,
  calendarDayKey,
  resolveCalendarDate,
  selectCalendarDayItem,
} from '../common/calendar.js';

type DashboardData = {
  selectedDate: Date;
  selectedKey: string;
  timeZone: string;
  nightFeatures: NightFeature[];
  sleepDetections: SleepDetection[];
  sleepStages: SleepStage[];
  dailyScores: DailyScore[];
  dailyMetrics: DailyMetric[];
  baselineProfile: BaselineProfile | null;
  sleepPlan: SleepPlan | null;
  journalEntries: JournalEntry[];
};

@Injectable()
export class ViewsService {
  constructor(
    @InjectRepository(SleepDetection)
    private readonly sleepDetectionRepo: Repository<SleepDetection>,
    @InjectRepository(SleepStage)
    private readonly sleepStageRepo: Repository<SleepStage>,
    @InjectRepository(NightFeature)
    private readonly nightFeatureRepo: Repository<NightFeature>,
    @InjectRepository(DailyScore)
    private readonly dailyScoreRepo: Repository<DailyScore>,
    @InjectRepository(DailyMetric)
    private readonly dailyMetricRepo: Repository<DailyMetric>,
    @InjectRepository(BaselineProfile)
    private readonly baselineRepo: Repository<BaselineProfile>,
    @InjectRepository(JournalEntry)
    private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(SleepPlan)
    private readonly sleepPlanRepo: Repository<SleepPlan>,
    @InjectRepository(SignalSample)
    private readonly signalSampleRepo: Repository<SignalSample>,
    @InjectRepository(ActivityDetection)
    private readonly activityDetectionRepo: Repository<ActivityDetection>,
  ) {}

  async getHomeView(userId: string, selectedDateInput?: string, timeZoneInput?: string) {
    const data = await this.loadDashboardData(userId, selectedDateInput, timeZoneInput);

    // Fetch detected activities for the selected day
    const { start: dayStart, end: dayEnd } = calendarDayBounds(
      data.selectedKey,
      data.timeZone,
    );
    const dayActivities = await this.activityDetectionRepo.find({
      where: { userId, startTime: Between(dayStart, dayEnd) },
      order: { startTime: 'ASC' },
    });
    const requestedKey = data.selectedKey;
    const selectedDetection = this.findSleepByDay(
      data.sleepDetections,
      'nightDate',
      data.selectedKey,
      data.timeZone,
    );

    const selectedScore = this.findByDay(
      data.dailyScores,
      'dayDate',
      data.selectedKey,
      data.timeZone,
    );
    const selectedMetric = this.findByDay(
      data.dailyMetrics,
      'dayDate',
      data.selectedKey,
      data.timeZone,
    );
    const selectedFeature = this.findSleepByDay(
      data.nightFeatures,
      'nightDate',
      data.selectedKey,
      data.timeZone,
    );
    const liveDateLabel = `${this.formatSelectedDateTitle(data.selectedDate, data.timeZone)} · ${this.formatSelectedDateSubtitle(data.selectedDate, data.timeZone)}`;
    const baselineReady = (data.baselineProfile?.nightsUsed ?? 0) >= 5;

    const selectedStage = this.findSleepByDay(
      data.sleepStages,
      'nightDate',
      data.selectedKey,
      data.timeZone,
    );
    const homeSleepScore =
      selectedDetection == null
        ? null
        : computeSleepScoreForNight(
            selectedDetection.durationHours,
            data.sleepPlan?.targetSleepMinutes ?? 480,
            selectedStage ? this.toStageSummary(selectedStage) : null,
            this.toDetectionSummary(selectedDetection),
            selectedFeature == null
              ? null
              : {
                  nightDate: selectedFeature.nightDate,
                  restingHeartRate: selectedFeature.restingHeartRate,
                  rmssd: selectedFeature.rmssd,
                  sdnn: selectedFeature.sdnn,
                  pnn50: (selectedFeature as any).pnn50 ?? 0,
                  respiratoryRate: selectedFeature.respiratoryRate,
                  continuity: selectedFeature.continuity,
                  regularity: selectedFeature.regularity,
                  validCoverage: selectedFeature.validCoverage,
                  confidenceRaw: selectedFeature.confidenceRaw,
                  sleepEstimateHours: selectedFeature.sleepEstimateHours,
                  sourceBlend: selectedFeature.sourceBlend,
                },
            {
              restingHeartRate: data.baselineProfile?.restingHeartRate ?? 0,
              rmssd: data.baselineProfile?.rmssd ?? 0,
              sdnn: data.baselineProfile?.sdnn ?? 0,
              nightsUsed: data.baselineProfile?.nightsUsed ?? 0,
              isWarmedUp: (data.baselineProfile?.nightsUsed ?? 0) >= 5,
              maxHeartRate: data.baselineProfile?.maxHeartRate ?? null,
            },
          );

    const rings = {
      sleep: {
        value: homeSleepScore == null ? '--' : `${homeSleepScore}`,
        progress: this.clamp01((homeSleepScore ?? 0) / 100),
      },
      recovery: {
        value: selectedScore ? `${selectedScore.dailyBalance}%` : '--',
        progress: this.normalizedPercent(selectedScore?.dailyBalance),
      },
      strain: {
        value:
          selectedMetric?.strainScore != null
            ? this.formatDecimal(selectedMetric.strainScore, 2)
            : '--',
        progress: this.clamp01((selectedMetric?.strainScore ?? 0) / 21),
      },
    };

    const topInsightTitle = selectedScore?.recommendation ?? 'Steady';
    const liveHeartRateValue = '--';
    const liveHeartRateSubtitle = 'Offline';

    return {
      selectedDate: requestedKey,
      selectedDateTitle: this.formatSelectedDateTitle(data.selectedDate, data.timeZone),
      selectedDateSubtitle: this.formatSelectedDateSubtitle(data.selectedDate, data.timeZone),
      topStrip: {
        title: this.formatSelectedDateTitle(data.selectedDate, data.timeZone),
        subtitle: this.formatSelectedDateSubtitle(data.selectedDate, data.timeZone),
      },
      rings,
      cards: {
        recommendation: {
          title: topInsightTitle,
          subtitle: this.formatSelectedDateSubtitle(data.selectedDate, data.timeZone),
          footer: 'Health monitor',
        },
        stress: {
          title:
            selectedMetric?.stressAverage != null
              ? this.formatDecimal(selectedMetric.stressAverage, 2)
              : '--',
          subtitle: 'Stress level',
          footer: 'Stress monitor',
        },
        loadPressure: {
          title: selectedScore ? `${selectedScore.loadPressure}` : '--',
          subtitle: 'Load pressure',
          footer: 'Daily load',
        },
        liveHeartRate: {
          title: liveHeartRateValue,
          subtitle: liveHeartRateSubtitle,
          footer: 'Heart rate',
        },
      },
      todayOverview: {
        headline: this.buildTodayHeadline(selectedScore, baselineReady),
        detail: this.buildTodaySubheadline(selectedScore, data.baselineProfile),
        dailyBalance: selectedScore ? `${selectedScore.dailyBalance}` : '--',
        loadPressure: selectedScore ? `${selectedScore.loadPressure}` : '--',
        sleepReserve: selectedScore
          ? `${selectedScore.sleepReserveHours >= 0 ? '+' : ''}${selectedScore.sleepReserveHours.toFixed(1)}h`
          : '--',
        confidence: selectedScore?.confidence ?? 'Low',
        dateLabel: liveDateLabel,
      },
      activities: {
        hrv:
          selectedFeature?.rmssd != null
            ? `${Math.round(selectedFeature.rmssd)}`
            : '--',
        hrvMs: selectedFeature?.rmssd ?? null,
        restingHr:
          selectedFeature?.restingHeartRate != null
            ? `${Math.round(selectedFeature.restingHeartRate)}`
            : '--',
        baselineRhr: data.baselineProfile?.restingHeartRate ?? null,
        odiPerHour: selectedMetric?.odiPerHour ?? null,
        stress:
          selectedMetric?.stressAverage != null
            ? this.formatDecimal(selectedMetric.stressAverage, 2)
            : '--',
        spo2:
          selectedMetric?.spo2Average != null
            ? `${selectedMetric.spo2Average.toFixed(1)}%`
            : '--',
        skinTemp:
          selectedMetric?.skinTempAvgCelsius != null
            ? `${selectedMetric.skinTempAvgCelsius.toFixed(1)}C`
            : '--',
        strain:
          selectedMetric?.strainScore != null
            ? this.formatDecimal(selectedMetric.strainScore, 2)
            : '--',
        skinTempDelta:
          selectedMetric?.skinTempDeltaCelsius != null
            ? `${selectedMetric.skinTempDeltaCelsius >= 0 ? '+' : ''}${selectedMetric.skinTempDeltaCelsius.toFixed(2)}C`
            : '--',
        trainingLoad:
          selectedMetric?.trainingLoadRatio != null
            ? `${selectedMetric.trainingLoadRatio.toFixed(2)}`
            : '--',
        trainingLoadRiskZone: selectedMetric?.trainingLoadRiskZone ?? '--',
        spo2Dips:
          selectedMetric?.spo2DipCount != null
            ? `${selectedMetric.spo2DipCount}`
            : '--',
        activityFeed: dayActivities
          .filter((a) => a.activityType !== 'Sedentary' && a.activityType !== 'Rest')
          .map((a) => ({
            type: a.activityType,
            duration: `${Math.round(a.durationMinutes)} min`,
            strain: a.strainScore.toFixed(1),
            intensity: a.intensity,
            time: a.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          })),
        totalActiveMinutes: (() => {
          const total = dayActivities
            .filter((a) => a.activityType !== 'Sedentary' && a.activityType !== 'Rest')
            .reduce((s, a) => s + a.durationMinutes, 0);
          return total > 0 ? `${Math.round(total)}` : '--';
        })(),
        activityCount: dayActivities
          .filter((a) => a.activityType !== 'Sedentary' && a.activityType !== 'Rest').length,
      },
      confidence: {
        confidence: selectedScore?.confidence ?? 'Low',
        pipelineStatus: this.buildPipelineStatus(
          data.dailyScores,
          data.selectedKey,
          data.timeZone,
        ),
        sourceBlend: selectedFeature?.sourceBlend ?? 'No data',
        storageMode: 'Local-only storage',
        persistenceHealth: data.dailyScores.length > 0 ? 'Healthy' : 'Unavailable',
        disclaimer:
          'Wellness estimates use wearable PPG trends and are not medical or diagnostic outputs.',
      },
      trendSummary: {
        summary: this.buildTrendSummary(data.dailyScores),
        samples: data.dailyScores.map((score) => ({
          timestamp: score.dayDate.toISOString(),
          value: score.dailyBalance,
        })),
      },
      stressTrend: data.dailyMetrics
        .filter((metric) => metric.stressAverage != null)
        .map((metric) => ({
          timestamp: metric.dayDate.toISOString(),
          value: metric.stressAverage,
        })),
      strainTrend: data.dailyMetrics
        .filter((metric) => metric.strainScore != null)
        .map((metric) => ({
          timestamp: metric.dayDate.toISOString(),
          value: metric.strainScore,
        })),
      noDataReasons: {
        recovery:
          'Readiness requires enough high-quality overnight samples. Run a sync and let baseline warm-up complete.',
        strain:
          'Strain appears once the day has enough heart-rate coverage. Keep device connected or import recent history.',
        stress:
          'Stress needs RR/IBI windows from clean signal. Sync strap history or provide richer data coverage.',
        loadPressure:
          'Load pressure is tied to the daily score pipeline. Run sync/recompute after data ingestion.',
        liveHeartRate: 'Live heart-rate requires an active strap realtime stream.',
        activities: 'Activities summary needs strain or stress data from today.',
      },
    };
  }

  async getSleepView(userId: string, selectedDateInput?: string, timeZoneInput?: string) {
    const data = await this.loadDashboardData(userId, selectedDateInput, timeZoneInput);

    const requestedKey = data.selectedKey;
    const selectedDetection = this.findSleepByDay(
      data.sleepDetections,
      'nightDate',
      data.selectedKey,
      data.timeZone,
    );

    const selectedScore = this.findByDay(
      data.dailyScores,
      'dayDate',
      data.selectedKey,
      data.timeZone,
    );
    const selectedMetric = this.findByDay(
      data.dailyMetrics,
      'dayDate',
      data.selectedKey,
      data.timeZone,
    );
    const selectedStage = this.findSleepByDay(
      data.sleepStages,
      'nightDate',
      data.selectedKey,
      data.timeZone,
    );
    const selectedFeature = this.findSleepByDay(
      data.nightFeatures,
      'nightDate',
      data.selectedKey,
      data.timeZone,
    );

    const detectionInterfaces = data.sleepDetections.map((d) => this.toDetectionSummary(d));
    const stageInterfaces = data.sleepStages.map((s) => this.toStageSummary(s));
    const typicalRanges = computeTypicalRanges(
      detectionInterfaces,
      stageInterfaces,
      data.selectedDate,
    ) as SleepTypicalRanges | null;

    const journalEntries: JournalFactorEntry[] = data.journalEntries.map((entry) => ({
      timestamp: entry.timestamp,
      factorTag: entry.factorTag,
      intensity: entry.intensity,
      note: entry.note,
    }));
    const factorInsights = journalSleepCorrelations(
      journalEntries,
      stageInterfaces,
      detectionInterfaces,
    ) as JournalSleepCorrelation[];

    const signalSamples =
      selectedDetection == null
        ? []
        : await this.signalSampleRepo.find({
            where: {
              userId,
              timestamp: Between(selectedDetection.bedtime, selectedDetection.wakeTime),
            },
            order: { timestamp: 'ASC' },
          });

    const selectedDetectionSummary = selectedDetection
      ? this.toDetectionSummary(selectedDetection)
      : null;
    const selectedStageSummary = selectedStage ? this.toStageSummary(selectedStage) : null;
    const selectedDurationHours = selectedDetectionSummary?.durationHours ?? null;
    const restorativeMinutes = selectedStageSummary
      ? selectedStageSummary.deepMinutes + selectedStageSummary.remMinutes
      : null;

    const durationVsTypical =
      selectedDurationHours == null || typicalRanges == null
        ? ''
        : this.formatTypicalHoursDelta(selectedDurationHours, typicalRanges.typicalDurationMinutes / 60);
    const restorativeVsTypical =
      restorativeMinutes == null || typicalRanges == null
        ? ''
        : this.formatTypicalMinutesDelta(
            restorativeMinutes,
            typicalRanges.typicalRestorativeMinutes,
          );

    const sleepScoreTrend = data.sleepDetections
      .slice(-7)
      .map((detection) => {
        const matchingStage = this.findByDay(
          data.sleepStages,
          'nightDate',
          this.dayKey(detection.nightDate, data.timeZone),
          data.timeZone,
        );
        const matchingFeature = this.findByDay(
          data.nightFeatures,
          'nightDate',
          this.dayKey(detection.nightDate, data.timeZone),
          data.timeZone,
        );
        const score = computeSleepScoreForNight(
          detection.durationHours,
          data.sleepPlan?.targetSleepMinutes ?? 480,
          matchingStage ? this.toStageSummary(matchingStage) : null,
          this.toDetectionSummary(detection),
          matchingFeature
            ? {
                nightDate: matchingFeature.nightDate,
                restingHeartRate: matchingFeature.restingHeartRate,
                rmssd: matchingFeature.rmssd,
                sdnn: matchingFeature.sdnn,
                pnn50: (matchingFeature as any).pnn50 ?? 0,
                respiratoryRate: matchingFeature.respiratoryRate,
                continuity: matchingFeature.continuity,
                regularity: matchingFeature.regularity,
                validCoverage: matchingFeature.validCoverage,
                confidenceRaw: matchingFeature.confidenceRaw,
                sleepEstimateHours: matchingFeature.sleepEstimateHours,
                sourceBlend: matchingFeature.sourceBlend,
              }
            : null,
          {
            restingHeartRate: data.baselineProfile?.restingHeartRate ?? 0,
            rmssd: data.baselineProfile?.rmssd ?? 0,
            sdnn: data.baselineProfile?.sdnn ?? 0,
            nightsUsed: data.baselineProfile?.nightsUsed ?? 0,
            isWarmedUp: (data.baselineProfile?.nightsUsed ?? 0) >= 5,
            maxHeartRate: data.baselineProfile?.maxHeartRate ?? null,
          },
        );

        return score == null
          ? null
          : {
              timestamp: detection.nightDate.toISOString(),
              value: score,
            };
      })
      .filter(Boolean);

    const priorScoreValues = data.dailyScores
      .filter((s) => this.dayKey(s.dayDate, data.timeZone) !== data.selectedKey)
      .slice(-7)
      .map((s) => s.dailyBalance);

    const priorFeatures = data.nightFeatures
      .filter((f) => this.dayKey(f.nightDate, data.timeZone) !== data.selectedKey)
      .slice(-7);

    const priorMetrics = data.dailyMetrics
      .filter((m) => this.dayKey(m.dayDate, data.timeZone) !== data.selectedKey)
      .slice(-7);

    const priorDetections = data.sleepDetections
      .filter((d) => this.dayKey(d.nightDate, data.timeZone) !== data.selectedKey)
      .slice(-7);

    const score = {
      value: selectedScore?.dailyBalance ?? null,
      label: selectedScore?.recommendation ?? 'Unknown',
      confidence: selectedScore?.confidence ?? 'Low',
      detail: selectedScore?.detail ?? '',
      deltaVsWeek: deltaVsWeek(selectedScore?.dailyBalance ?? null, priorScoreValues),
    };

    const vitalsDelta = {
      efficiency: deltaVsWeek(
        selectedDetection?.continuity ?? null,
        priorDetections.map((d) => d.continuity),
      ),
      rhr: deltaVsWeek(
        selectedFeature?.restingHeartRate ?? null,
        priorFeatures.map((f) => f.restingHeartRate),
      ),
      hrv: deltaVsWeek(
        selectedFeature?.rmssd ?? null,
        priorFeatures.map((f) => f.rmssd),
      ),
      skinTempDelta: deltaVsWeek(
        selectedMetric?.skinTempDeltaCelsius ?? null,
        priorMetrics.map((m) => m.skinTempDeltaCelsius),
      ),
    };

    return {
      selectedDate: requestedKey,
      selectedDateTitle: this.formatSelectedDateTitle(data.selectedDate, data.timeZone),
      selectedDateSubtitle: this.formatSelectedDateSubtitle(data.selectedDate, data.timeZone),
      emptyState: {
        isEmpty: selectedDetectionSummary == null,
        title: 'No sleep data yet',
        subtitle: 'Wear your strap tonight to see your first sleep breakdown.',
        support:
          'Enable Health access for additional sleep data.',
      },
      header: {
        bedtime:
          selectedDetectionSummary == null
            ? '--'
            : this.formatTimeOnly(selectedDetectionSummary.bedtime, data.timeZone),
        wakeTime:
          selectedDetectionSummary == null
            ? '--'
            : this.formatTimeOnly(selectedDetectionSummary.wakeTime, data.timeZone),
        duration:
          selectedDurationHours == null
            ? '--'
            : this.formatDurationHours(selectedDurationHours),
        restorative:
          restorativeMinutes == null
            ? '--'
            : this.formatMinutes(restorativeMinutes),
        timeInBed:
          selectedDetectionSummary == null
            ? '--'
            : this.formatMinutes(
                Math.max(
                  0,
                  Math.round(
                    (selectedDetectionSummary.wakeTime.getTime() -
                      selectedDetectionSummary.bedtime.getTime()) /
                      60000,
                  ),
                ),
              ),
        durationVsTypical,
        restorativeVsTypical,
      },
      sleepInsight: this.buildSleepInsight(
        selectedDurationHours,
        selectedStageSummary,
        typicalRanges,
      ),
      hrChart: {
        samples: signalSamples
          .filter((sample) => sample.heartRate != null)
          .map((sample) => ({
            timestamp: sample.timestamp.toISOString(),
            value: sample.heartRate,
          })),
      },
      stageRows: this.buildSleepStageRows(selectedStageSummary, typicalRanges),
      epochTimeline: (selectedStageSummary?.epochTimeline ?? []).map((epoch) => ({
        timestamp: epoch.timestamp.toISOString(),
        stage: epoch.stage,
      })),
      durationTrend: {
        targetHours: (data.sleepPlan?.targetSleepMinutes ?? 480) / 60,
        samples: data.sleepDetections.slice(-7).map((detection) => ({
          timestamp: detection.nightDate.toISOString(),
          value: detection.durationHours,
        })),
      },
      sleepScoreTrend,
      hrvTrend: data.nightFeatures
        .slice(-7)
        .filter((f) => f.rmssd != null && f.rmssd > 0)
        .map((f) => ({ timestamp: f.nightDate.toISOString(), value: f.rmssd })),
      metrics: this.buildSleepMetrics(
        selectedScore,
        selectedMetric,
        selectedDetectionSummary,
        selectedFeature,
        data.baselineProfile,
        data.sleepPlan,
        selectedStageSummary,
        data.nightFeatures,
        detectionInterfaces,
      ),
      factorInsights: factorInsights.map((correlation) => ({
        factorTag: correlation.factorTag,
        occurrences: correlation.sampleCount,
        deepMin: Math.round(correlation.avgDeepDelta ?? 0),
        remMin: Math.round(correlation.avgRemDelta ?? 0),
        awakeMin: 0,
        effectSize: Math.max(
          Math.abs(correlation.avgDeepDelta ?? 0),
          Math.abs(correlation.avgRemDelta ?? 0),
        ),
      })),
      planner: {
        targetSleepMinutes: data.sleepPlan?.targetSleepMinutes ?? 480,
        wakeMinutes: data.sleepPlan?.wakeMinutes ?? 420,
        alarmEnabled: data.sleepPlan?.alarmEnabled ?? false,
        alarmMinutes: data.sleepPlan?.alarmMinutes ?? 420,
        smartWakeEnabled: data.sleepPlan?.smartWakeEnabled ?? false,
        alarmStatusText: this.buildAlarmStatusText(data.sleepPlan),
        sleepReserveText:
          selectedScore == null
            ? '--'
            : `${selectedScore.sleepReserveHours >= 0 ? '+' : ''}${selectedScore.sleepReserveHours.toFixed(1)}h`,
        estimatedSleepHours:
          selectedFeature?.sleepEstimateHours != null
            ? `${selectedFeature.sleepEstimateHours.toFixed(1)} h`
            : '--',
        smartWakeStatusText: this.buildSmartWakeStatusText(
          data.sleepPlan,
          selectedStageSummary,
        ),
      },
      confidence: {
        confidence: selectedScore?.confidence ?? 'Low',
        pipelineStatus: this.buildPipelineStatus(
          data.dailyScores,
          data.selectedKey,
          data.timeZone,
        ),
        sourceBlend: selectedFeature?.sourceBlend ?? 'No data',
        storageMode: 'Local-only storage',
        persistenceHealth: data.dailyScores.length > 0 ? 'Healthy' : 'Unavailable',
        disclaimer:
          'Wellness estimates use wearable PPG trends and are not medical or diagnostic outputs.',
      },
      score,
      vitalsDelta,
    };
  }

  async getTrendsView(userId: string, days: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const [nightFeatures, dailyMetrics, dailyScores, sleepDetections] = await Promise.all([
      this.nightFeatureRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.dailyMetricRepo.find({
        where: { userId, dayDate: MoreThanOrEqual(cutoff) },
        order: { dayDate: 'ASC' },
      }),
      this.dailyScoreRepo.find({
        where: { userId, dayDate: MoreThanOrEqual(cutoff) },
        order: { dayDate: 'ASC' },
      }),
      this.sleepDetectionRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
    ]);

    const toSeries = <T>(items: T[], dateKey: keyof T, valueKey: keyof T) =>
      items
        .filter((item) => item[valueKey] != null)
        .map((item) => ({
          timestamp: (item[dateKey] as Date).toISOString(),
          value: item[valueKey] as number,
        }));

    // Nightly HRV (RMSSD) — key autonomic health indicator
    const hrvTrend = toSeries(nightFeatures, 'nightDate', 'rmssd');

    // Nightly Resting HR — fitness / overtraining marker
    const restingHrTrend = toSeries(nightFeatures, 'nightDate', 'restingHeartRate');

    // Nightly respiratory rate — recovery, illness, training-stress signal
    const respiratoryRateTrend = toSeries(nightFeatures, 'nightDate', 'respiratoryRate');

    // Nightly average SpO2 — overnight oxygenation
    const spo2Trend = toSeries(dailyMetrics, 'dayDate', 'spo2Average' as any);

    // Sleep duration trend
    const sleepDurationTrend = sleepDetections.map((d) => ({
      timestamp: d.nightDate.toISOString(),
      value: Math.round(d.durationHours * 10) / 10,
    }));

    // Recovery trend (daily balance)
    const recoveryTrend = dailyScores.map((s) => ({
      timestamp: s.dayDate.toISOString(),
      value: s.dailyBalance,
    }));

    // Training load ratio trend — injury risk over time
    const trainingLoadTrend = toSeries(dailyMetrics, 'dayDate', 'trainingLoadRatio' as any);

    // Sleep consistency trend
    const consistencyTrend = toSeries(dailyMetrics, 'dayDate', 'sleepConsistencyScore' as any);

    // Strain trend
    const strainTrend = toSeries(dailyMetrics, 'dayDate', 'strainScore' as any);

    // Stress trend
    const stressTrend = toSeries(dailyMetrics, 'dayDate', 'stressAverage' as any);

    // Summaries — current vs 7-day-ago comparison for key metrics
    const latestFeature = nightFeatures.length > 0 ? nightFeatures[nightFeatures.length - 1] : null;
    const weekAgoIdx = Math.max(0, nightFeatures.length - 8);
    const weekAgoFeature = nightFeatures.length > 7 ? nightFeatures[weekAgoIdx] : null;

    const summaries = {
      hrv: {
        current: latestFeature?.rmssd ?? null,
        weekAgo: weekAgoFeature?.rmssd ?? null,
        trend: latestFeature && weekAgoFeature
          ? (latestFeature.rmssd > weekAgoFeature.rmssd ? 'improving' : latestFeature.rmssd < weekAgoFeature.rmssd ? 'declining' : 'stable')
          : null,
      },
      restingHr: {
        current: latestFeature?.restingHeartRate ?? null,
        weekAgo: weekAgoFeature?.restingHeartRate ?? null,
        trend: latestFeature && weekAgoFeature
          ? (latestFeature.restingHeartRate < weekAgoFeature.restingHeartRate ? 'improving' : latestFeature.restingHeartRate > weekAgoFeature.restingHeartRate ? 'declining' : 'stable')
          : null,
      },
      sleepDuration: {
        avgHours: sleepDetections.length > 0
          ? Math.round(sleepDetections.reduce((s, d) => s + d.durationHours, 0) / sleepDetections.length * 10) / 10
          : null,
        nights: sleepDetections.length,
      },
    };

    return {
      days,
      dataPoints: nightFeatures.length,
      hrvTrend,
      restingHrTrend,
      sleepDurationTrend,
      recoveryTrend,
      trainingLoadTrend,
      consistencyTrend,
      strainTrend,
      stressTrend,
      respiratoryRateTrend,
      spo2Trend,
      summaries,
    };
  }

  async updateSleepPlan(userId: string, dto: UpdateSleepPlanDto) {
    const existing = await this.sleepPlanRepo.findOne({ where: { userId } });
    const entity = existing ?? this.sleepPlanRepo.create({ userId });
    entity.targetSleepMinutes = dto.targetSleepMinutes;
    entity.wakeMinutes = dto.wakeMinutes;
    entity.alarmEnabled = dto.alarmEnabled;
    entity.alarmMinutes = dto.alarmMinutes;
    entity.smartWakeEnabled = dto.smartWakeEnabled;
    await this.sleepPlanRepo.save(entity);
    return {
      ok: true,
      sleepView: await this.getSleepView(userId),
    };
  }

  private async loadDashboardData(
    userId: string,
    selectedDateInput?: string,
    timeZoneInput?: string,
  ): Promise<DashboardData> {
    const { selectedDate, selectedKey, timeZone } = resolveCalendarDate(
      selectedDateInput,
      timeZoneInput,
    );
    const cutoff = new Date(selectedDate.getTime() - 45 * 24 * 60 * 60 * 1000);

    const [
      nightFeatures,
      sleepDetections,
      sleepStages,
      dailyScores,
      dailyMetrics,
      baselineProfile,
      sleepPlan,
      journalEntries,
    ] = await Promise.all([
      this.nightFeatureRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepDetectionRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.sleepStageRepo.find({
        where: { userId, nightDate: MoreThanOrEqual(cutoff) },
        order: { nightDate: 'ASC' },
      }),
      this.dailyScoreRepo.find({
        where: { userId, dayDate: MoreThanOrEqual(cutoff) },
        order: { dayDate: 'ASC' },
      }),
      this.dailyMetricRepo.find({
        where: { userId, dayDate: MoreThanOrEqual(cutoff) },
        order: { dayDate: 'ASC' },
      }),
      this.baselineRepo.findOne({ where: { userId } }),
      this.sleepPlanRepo.findOne({ where: { userId } }),
      this.journalRepo.find({
        where: { userId, timestamp: MoreThanOrEqual(cutoff) },
        order: { timestamp: 'ASC' },
      }),
    ]);

    return {
      selectedDate,
      selectedKey,
      timeZone,
      nightFeatures,
      sleepDetections,
      sleepStages,
      dailyScores,
      dailyMetrics,
      baselineProfile,
      sleepPlan,
      journalEntries,
    };
  }

  private resolveSelectedDate(dateInput?: string, timeZone?: string) {
    return resolveCalendarDate(dateInput, timeZone).selectedDate;
  }

  private dayKey(date: Date, timeZone?: string) {
    return calendarDayKey(date, timeZone);
  }

  private findByDay<T extends Record<string, any>>(
    items: T[],
    key: keyof T,
    selectedKey: string,
    timeZone?: string,
  ): T | null {
    return selectCalendarDayItem(items, key, selectedKey, timeZone);
  }

  private findSleepByDay<T extends Record<string, any>>(
    items: T[],
    key: keyof T,
    selectedKey: string,
    timeZone?: string,
  ): T | null {
    return this.findByDay(items, key, selectedKey, timeZone);
  }

  private formatSelectedDateTitle(date: Date, timeZone?: string) {
    const now = new Date();
    const todayKey = this.dayKey(now, timeZone);
    const yesterdayKey = this.dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
    const tomorrowKey = this.dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone);
    const key = this.dayKey(date, timeZone);
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    if (key === tomorrowKey) return 'Tomorrow';
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  private isToday(date: Date, timeZone?: string) {
    const now = new Date();
    return this.dayKey(date, timeZone) === this.dayKey(now, timeZone);
  }

  private formatSelectedDateSubtitle(date: Date, timeZone?: string) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  private normalizedPercent(value?: number | null) {
    return this.clamp01((value ?? 0) / 100);
  }

  private clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  private computeSleepAttainmentPercent(
    durationHours: number | null,
    targetSleepMinutes: number,
  ) {
    if (durationHours == null) return null;
    return Math.max(0, Math.min(100, (durationHours / (targetSleepMinutes / 60)) * 100));
  }

  private buildTodayHeadline(
    selectedScore:
      | Pick<DailyScore, 'confidence' | 'recommendation'>
      | null,
    baselineReady: boolean,
  ) {
    if (!selectedScore) return 'Not enough high-quality signal yet';
    if (selectedScore.confidence === 'Low') return 'Insufficient high-quality signal';
    if (!baselineReady) return 'Building your personal baseline';
    if (selectedScore.recommendation === 'Restore') return 'Prioritize recovery';
    if (selectedScore.recommendation === 'Build') return 'You can push a bit more';
    return 'A balanced day is best';
  }

  private buildTodaySubheadline(
    selectedScore:
      | Pick<
          DailyScore,
          'dailyBalance' | 'loadPressure' | 'sleepReserveHours' | 'confidence' | 'recommendation'
        >
      | null,
    baselineProfile: BaselineProfile | null,
  ) {
    if (!selectedScore) {
      return 'Connect your strap and sync to generate this day\'s score.';
    }
    if ((baselineProfile?.nightsUsed ?? 0) < 5) {
      const remaining = Math.max(0, 5 - (baselineProfile?.nightsUsed ?? 0));
      return `Baseline warm-up in progress. ${remaining} more high-quality night(s) needed for stable trends.`;
    }
    return `Daily Balance ${selectedScore.dailyBalance} · Load Pressure ${selectedScore.loadPressure} · Sleep Reserve ${selectedScore.sleepReserveHours.toFixed(1)}h`;
  }

  private buildTrendSummary(scores: DailyScore[]) {
    if (scores.length < 2) return 'Need at least 2 days of data to build a trend.';
    const first = scores[0];
    const last = scores[scores.length - 1];
    const delta = last.dailyBalance - first.dailyBalance;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return `Daily Balance is ${direction} by ${Math.abs(delta)} points over this window.`;
  }

  private buildPipelineStatus(scores: DailyScore[], selectedKey: string, timeZone?: string) {
    if (scores.length === 0) return 'Waiting for first sync';
    const hasSelected = scores.some(
      (score) => this.dayKey(score.dayDate, timeZone) === selectedKey,
    );
    return hasSelected ? 'Selected day is derived from stored pipeline results.' : 'Latest pipeline results are available.';
  }

  private toDetectionSummary(detection: SleepDetection): SleepDetectionSummary {
    return {
      nightDate: detection.nightDate,
      bedtime: detection.bedtime,
      wakeTime: detection.wakeTime,
      durationHours: detection.durationHours,
      interruptionCount: detection.interruptionCount,
      continuity: detection.continuity,
      regularity: detection.regularity,
      validCoverage: detection.validCoverage,
      confidence: detection.confidence,
    };
  }

  private toStageSummary(stage: SleepStage): SleepStageSummary {
    return {
      nightDate: stage.nightDate,
      remMinutes: stage.remMinutes,
      coreMinutes: stage.coreMinutes,
      deepMinutes: stage.deepMinutes,
      awakeMinutes: stage.awakeMinutes,
      unknownMinutes: stage.unknownMinutes,
      confidence: stage.confidence,
      source: stage.source,
      epochTimeline: ((stage.epochTimeline as any[]) ?? []).map((epoch) => ({
        timestamp: new Date(epoch.timestamp),
        stage: epoch.stage,
      })),
      epochMinutes: stage.epochMinutes,
    };
  }

  private formatDurationHours(hours: number) {
    const totalMinutes = Math.round(hours * 60);
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }

  private formatMinutes(minutes: number) {
    return `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
  }

  private formatTimeOnly(date: Date, timeZone?: string) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  private formatTypicalHoursDelta(currentHours: number, typicalHours: number) {
    const totalTypicalMinutes = Math.round(typicalHours * 60);
    const arrow = currentHours >= typicalHours ? '▲' : '▼';
    return `${arrow} ${Math.floor(totalTypicalMinutes / 60)}:${String(totalTypicalMinutes % 60).padStart(2, '0')}`;
  }

  private formatTypicalMinutesDelta(currentMinutes: number, typicalMinutes: number) {
    const roundedTypical = Math.round(typicalMinutes);
    const arrow = currentMinutes >= roundedTypical ? '▲' : '▼';
    return `${arrow} ${Math.floor(roundedTypical / 60)}:${String(roundedTypical % 60).padStart(2, '0')}`;
  }

  private buildSleepStageRows(
    selectedStage: SleepStageSummary | null,
    typicalRanges: SleepTypicalRanges | null,
  ) {
    if (!selectedStage) return [];
    const totalMinutes =
      selectedStage.remMinutes +
      selectedStage.coreMinutes +
      selectedStage.deepMinutes +
      selectedStage.awakeMinutes +
      selectedStage.unknownMinutes;
    if (totalMinutes <= 0) return [];

    const makeRow = (
      id: string,
      label: string,
      minutes: number,
      color: string,
      typicalRange?: { lower: number; upper: number },
    ) => {
      const percent = Math.round((minutes / totalMinutes) * 100);
      return {
        id,
        label,
        percent,
        durationFormatted: this.formatMinutes(minutes),
        color,
        barFraction: percent / 100,
        typicalRange:
          typicalRange == null
            ? null
            : {
                lower: typicalRange.lower,
                upper: typicalRange.upper,
              },
      };
    };

    return [
      makeRow('awake', 'AWAKE', selectedStage.awakeMinutes, '#888888', typicalRanges?.typicalAwakePercent),
      makeRow('light', 'LIGHT', selectedStage.coreMinutes, '#8066E6', typicalRanges?.typicalLightPercent),
      makeRow('deep', 'SWS (DEEP)', selectedStage.deepMinutes, '#D94D80', typicalRanges?.typicalDeepPercent),
      makeRow('rem', 'REM', selectedStage.remMinutes, '#B333CC', typicalRanges?.typicalRemPercent),
    ];
  }

  private buildSleepInsight(
    selectedDurationHours: number | null,
    selectedStage: SleepStageSummary | null,
    typicalRanges: SleepTypicalRanges | null,
  ) {
    if (!selectedStage) return null;
    const total = selectedStage.remMinutes + selectedStage.coreMinutes + selectedStage.deepMinutes + selectedStage.awakeMinutes + selectedStage.unknownMinutes;
    if (total <= 0) return null;

    const remPct = (selectedStage.remMinutes / total) * 100;
    const deepPct = (selectedStage.deepMinutes / total) * 100;
    const awakePct = (selectedStage.awakeMinutes / total) * 100;

    if (remPct > 28) {
      return `${Math.round(remPct)}% of your time in bed was spent in REM sleep. This might indicate your body is making up for recent REM debt.`;
    }
    if (deepPct < 10 && typicalRanges && typicalRanges.typicalDeepPercent.lower > 12) {
      return 'Your deep sleep was below your typical range. Alcohol, late meals, or high stress can reduce deep sleep.';
    }
    if (awakePct > 10) {
      return `You were awake for ${Math.round(awakePct)}% of your time in bed. High wake time may indicate restlessness or disruptions.`;
    }
    if (selectedDurationHours != null && typicalRanges) {
      const typicalHours = typicalRanges.typicalDurationMinutes / 60;
      if (selectedDurationHours < typicalHours - 0.5) {
        const diffMinutes = Math.round((typicalHours - selectedDurationHours) * 60);
        return `You slept ${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m less than your typical duration. Consistent sleep duration supports recovery.`;
      }
    }
    if (remPct >= 15 && remPct <= 25 && deepPct >= 10 && deepPct <= 25) {
      return 'Your sleep stages were within healthy ranges. Consistency like this supports long-term recovery.';
    }
    return null;
  }

  private buildSleepMetrics(
    selectedScore: DailyScore | null,
    selectedMetric: DailyMetric | null,
    selectedDetection: SleepDetectionSummary | null,
    selectedFeature: NightFeature | null,
    baselineProfile: BaselineProfile | null,
    sleepPlan: SleepPlan | null,
    selectedStage: SleepStageSummary | null,
    allNightFeatures: NightFeature[] = [],
    allDetections: SleepDetectionSummary[] = [],
  ) {
    const timeInBedMinutes =
      selectedDetection == null
        ? null
        : Math.max(
            0,
            (selectedDetection.wakeTime.getTime() - selectedDetection.bedtime.getTime()) / 60000,
          );
    const efficiency =
      selectedDetection == null || !timeInBedMinutes
        ? null
        : Math.min(100, (selectedDetection.durationHours * 60 * 100) / timeInBedMinutes);

    const sleepScore =
      selectedDetection == null
        ? null
        : computeSleepScoreForNight(
            selectedDetection.durationHours,
            sleepPlan?.targetSleepMinutes ?? 480,
            selectedStage,
            selectedDetection,
            selectedFeature == null
              ? null
              : {
                  nightDate: selectedFeature.nightDate,
                  restingHeartRate: selectedFeature.restingHeartRate,
                  rmssd: selectedFeature.rmssd,
                  sdnn: selectedFeature.sdnn,
                  pnn50: (selectedFeature as any).pnn50 ?? 0,
                  respiratoryRate: selectedFeature.respiratoryRate,
                  continuity: selectedFeature.continuity,
                  regularity: selectedFeature.regularity,
                  validCoverage: selectedFeature.validCoverage,
                  confidenceRaw: selectedFeature.confidenceRaw,
                  sleepEstimateHours: selectedFeature.sleepEstimateHours,
                  sourceBlend: selectedFeature.sourceBlend,
                },
            {
              restingHeartRate: baselineProfile?.restingHeartRate ?? 0,
              rmssd: baselineProfile?.rmssd ?? 0,
              sdnn: baselineProfile?.sdnn ?? 0,
              nightsUsed: baselineProfile?.nightsUsed ?? 0,
              isWarmedUp: (baselineProfile?.nightsUsed ?? 0) >= 5,
              maxHeartRate: baselineProfile?.maxHeartRate ?? null,
            },
          );

    return [
      {
        label: 'Recovery',
        value: selectedScore ? `${selectedScore.dailyBalance}%` : '--',
        detail: selectedScore?.recommendation ?? null,
      },
      {
        label: 'Sleep Reserve',
        value:
          selectedScore == null
            ? '--'
            : `${selectedScore.sleepReserveHours >= 0 ? '+' : ''}${selectedScore.sleepReserveHours.toFixed(1)}h`,
        detail: null,
      },
      {
        label: 'Efficiency',
        value: efficiency == null ? '--' : `${Math.round(efficiency)}%`,
        detail: null,
      },
      {
        label: 'Interruptions',
        value: selectedDetection == null ? '--' : `${selectedDetection.interruptionCount}`,
        detail: null,
      },
      {
        label: 'Sleep Score',
        value: sleepScore == null ? '--' : `${sleepScore}`,
        detail: '/ 100',
      },
      {
        label: 'Resting HR',
        value:
          selectedFeature == null ? '--' : `${Math.round(selectedFeature.restingHeartRate)} bpm`,
        detail:
          selectedFeature == null || baselineProfile == null || baselineProfile.nightsUsed < 5
            ? null
            : `${selectedFeature.restingHeartRate - baselineProfile.restingHeartRate >= 0 ? '+' : ''}${Math.round(selectedFeature.restingHeartRate - baselineProfile.restingHeartRate)}`,
      },
      {
        label: 'VO₂max (est.)',
        value: (() => {
          const v = computeVo2MaxUth(
            selectedFeature?.restingHeartRate ?? null,
            baselineProfile?.maxHeartRate ?? null,
          );
          return v == null ? '--' : `${v} mL/kg/min`;
        })(),
        detail: 'Uth formula (passive)',
      },
      {
        // Strain Coach target band — recovery → recommended day-strain.
        // Center mapped linearly across recovery 0-100 (4 → 17 strain),
        // band width ±3. WHOOP publishes the existence of this mapping
        // but not the slope; this matches their reported example
        // (8.3–16.3 at 70% recovery → center ~12.3).
        label: 'Today’s Strain Target',
        value: (() => {
          if (!selectedScore) return '--';
          const center = 4 + 0.13 * selectedScore.dailyBalance;
          const lo = Math.max(0, center - 3);
          const hi = Math.min(21, center + 3);
          return `${lo.toFixed(1)}–${hi.toFixed(1)}`;
        })(),
        detail: selectedScore
          ? `Recovery ${selectedScore.dailyBalance}% → optimal band`
          : null,
      },
      {
        label: 'HRV (RMSSD)',
        value: selectedFeature == null ? '--' : `${Math.round(selectedFeature.rmssd)} ms`,
        detail:
          selectedFeature == null || baselineProfile == null || baselineProfile.nightsUsed < 5
            ? null
            : `${selectedFeature.rmssd - baselineProfile.rmssd >= 0 ? '+' : ''}${Math.round(selectedFeature.rmssd - baselineProfile.rmssd)}`,
      },
      {
        label: 'HRV-CV (7d)',
        value: this.formatHrvCv(selectedFeature, allNightFeatures),
        detail: null,
      },
      {
        label: 'Sleep Need',
        value: (() => {
          if (!selectedDetection) return '--';
          const need = computeSleepNeed(
            sleepPlan?.targetSleepMinutes ?? 480,
            selectedMetric?.strainScore ?? null,
            allDetections,
            selectedDetection.nightDate,
          );
          const h = Math.floor(need.totalHours);
          const m = Math.round((need.totalHours - h) * 60);
          return `${h}h ${m}m`;
        })(),
        detail: (() => {
          if (!selectedDetection) return null;
          const need = computeSleepNeed(
            sleepPlan?.targetSleepMinutes ?? 480,
            selectedMetric?.strainScore ?? null,
            allDetections,
            selectedDetection.nightDate,
          );
          const parts: string[] = [];
          if (need.strainHours > 0.05)
            parts.push(`+${(need.strainHours * 60).toFixed(0)}m strain`);
          if (need.debtHours > 0.05)
            parts.push(`+${(need.debtHours * 60).toFixed(0)}m debt`);
          return parts.length > 0 ? parts.join(' · ') : null;
        })(),
      },
      {
        label: 'pNN50',
        value:
          selectedFeature == null
            ? '--'
            : `${((selectedFeature as any).pnn50 ?? 0).toFixed(1)}%`,
        detail: null,
      },
      {
        label: 'Poincaré SD1',
        value:
          selectedFeature == null
            ? '--'
            : `${(selectedFeature.rmssd / Math.SQRT2).toFixed(1)} ms`,
        detail: null,
      },
      {
        label: 'Poincaré SD2',
        value:
          selectedFeature == null
            ? '--'
            : (() => {
                const inside =
                  2 * selectedFeature.sdnn ** 2 - 0.5 * selectedFeature.rmssd ** 2;
                return inside > 0 ? `${Math.sqrt(inside).toFixed(1)} ms` : '--';
              })(),
        detail: null,
      },
      {
        label: 'Respiratory Rate',
        value:
          selectedFeature == null ? '--' : `${selectedFeature.respiratoryRate.toFixed(1)} rpm`,
        detail: null,
      },
      {
        label: 'Blood Oxygen',
        value:
          selectedMetric?.spo2Average != null
            ? `${selectedMetric.spo2Average.toFixed(1)}%`
            : '--',
        detail: null,
      },
      {
        label: 'Skin Temp',
        value:
          selectedMetric?.skinTempAvgCelsius != null
            ? `${selectedMetric.skinTempAvgCelsius.toFixed(1)}°C`
            : '--',
        detail:
          selectedMetric?.skinTempDeltaCelsius != null
            ? `${selectedMetric.skinTempDeltaCelsius >= 0 ? '+' : ''}${selectedMetric.skinTempDeltaCelsius.toFixed(2)}°C`
            : null,
      },
      {
        label: 'Consistency',
        value:
          selectedMetric?.sleepConsistencyScore != null
            ? `${Math.round(selectedMetric.sleepConsistencyScore)}`
            : '--',
        detail: '/ 100',
      },
      {
        label: 'Architecture Score',
        value:
          selectedMetric?.sleepArchitectureScore != null
            ? `${Math.round(selectedMetric.sleepArchitectureScore)}`
            : '--',
        detail: '/ 100',
      },
      {
        label: 'SpO2 Dips',
        value:
          selectedMetric?.spo2DipCount != null
            ? `${selectedMetric.spo2DipCount}`
            : '--',
        detail:
          selectedMetric?.odiPerHour != null
            ? `ODI ${selectedMetric.odiPerHour.toFixed(1)}/hr`
            : null,
      },
      {
        label: 'Core Temp',
        value:
          selectedMetric?.coreTemperatureEstimate != null
            ? `${selectedMetric.coreTemperatureEstimate.toFixed(1)}°C`
            : '--',
        detail: null,
      },
      {
        label: 'LF/HF Ratio',
        value:
          selectedMetric?.lfHfRatioAverage != null
            ? `${selectedMetric.lfHfRatioAverage.toFixed(2)}`
            : '--',
        detail: null,
      },
    ];
  }

  private buildAlarmStatusText(sleepPlan: SleepPlan | null) {
    if (!sleepPlan?.alarmEnabled) return 'Alarm disabled';
    return `Enabled for ${this.formatMinutesAsTime(sleepPlan.alarmMinutes)} (not armed)`;
  }

  private buildSmartWakeStatusText(
    sleepPlan: SleepPlan | null,
    selectedStage: SleepStageSummary | null,
  ) {
    if (!sleepPlan?.smartWakeEnabled) return '';
    if (!selectedStage?.epochTimeline?.length) return 'Smart wake: need more data';
    const latest = this.nextAlarmDate(sleepPlan.alarmMinutes);
    const earliest = new Date(latest.getTime() - 20 * 60 * 1000);
    return `Smart wake: ${this.formatTimeOnly(earliest)}-${this.formatTimeOnly(latest)}`;
  }

  private nextAlarmDate(alarmMinutes: number) {
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Math.floor(alarmMinutes / 60),
      alarmMinutes % 60,
      0,
      0,
    );
    return next > now ? next : new Date(next.getTime() + 24 * 60 * 60 * 1000);
  }

  private formatMinutesAsTime(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const base = new Date(2026, 0, 1, hours, minutes, 0, 0);
    return this.formatTimeOnly(base);
  }

  private formatDecimal(value: number, precision: number) {
    return value.toFixed(precision);
  }

  /**
   * HRV Coefficient of Variation: stdev / mean of RMSSD over a 7-day
   * trailing window. Published 2025 in Am J Physiol-Heart Circ Physiol
   * (Plews/Laursen/Altini/Galpin) as a stress-stability proxy.
   * Returns formatted percentage or '--' when the window has fewer
   * than 4 valid nights.
   */
  private formatHrvCv(
    selectedFeature: NightFeature | null,
    allNightFeatures: NightFeature[],
  ): string {
    if (!selectedFeature) return '--';
    const reference = selectedFeature.nightDate.getTime();
    const sevenDaysAgo = reference - 7 * 86_400_000;
    const window = allNightFeatures.filter(
      (f) =>
        f.nightDate.getTime() <= reference &&
        f.nightDate.getTime() > sevenDaysAgo &&
        f.rmssd > 0 &&
        f.validCoverage >= 0.35,
    );
    if (window.length < 4) return '--';
    const values = window.map((f) => f.rmssd);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return '--';
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const cv = (Math.sqrt(variance) / mean) * 100;
    return `${cv.toFixed(1)}%`;
  }
}
