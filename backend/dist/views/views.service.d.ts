import { Repository } from 'typeorm';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { UpdateSleepPlanDto } from './dto/update-sleep-plan.dto.js';
export declare class ViewsService {
    private readonly sleepDetectionRepo;
    private readonly sleepStageRepo;
    private readonly nightFeatureRepo;
    private readonly dailyScoreRepo;
    private readonly dailyMetricRepo;
    private readonly baselineRepo;
    private readonly journalRepo;
    private readonly sleepPlanRepo;
    private readonly signalSampleRepo;
    constructor(sleepDetectionRepo: Repository<SleepDetection>, sleepStageRepo: Repository<SleepStage>, nightFeatureRepo: Repository<NightFeature>, dailyScoreRepo: Repository<DailyScore>, dailyMetricRepo: Repository<DailyMetric>, baselineRepo: Repository<BaselineProfile>, journalRepo: Repository<JournalEntry>, sleepPlanRepo: Repository<SleepPlan>, signalSampleRepo: Repository<SignalSample>);
    getHomeView(userId: string, selectedDateInput?: string): Promise<{
        selectedDate: string;
        selectedDateTitle: string;
        selectedDateSubtitle: string;
        topStrip: {
            title: string;
            subtitle: string;
        };
        rings: {
            sleep: {
                value: string;
                progress: number;
            };
            recovery: {
                value: string;
                progress: number;
            };
            strain: {
                value: string;
                progress: number;
            };
        };
        cards: {
            recommendation: {
                title: string;
                subtitle: string;
                footer: string;
            };
            stress: {
                title: string;
                subtitle: string;
                footer: string;
            };
            loadPressure: {
                title: string;
                subtitle: string;
                footer: string;
            };
            liveHeartRate: {
                title: string;
                subtitle: string;
                footer: string;
            };
        };
        todayOverview: {
            headline: string;
            detail: string;
            dailyBalance: string;
            loadPressure: string;
            sleepReserve: string;
            confidence: string;
            dateLabel: string;
        };
        activities: {
            stress: string;
            spo2: string;
            skinTemp: string;
            strain: string;
            skinTempDelta: string;
        };
        confidence: {
            confidence: string;
            pipelineStatus: string;
            sourceBlend: string;
            storageMode: string;
            persistenceHealth: string;
            disclaimer: string;
        };
        trendSummary: {
            summary: string;
            samples: {
                timestamp: string;
                value: number;
            }[];
        };
        stressTrend: {
            timestamp: string;
            value: number;
        }[];
        strainTrend: {
            timestamp: string;
            value: number;
        }[];
        noDataReasons: {
            recovery: string;
            strain: string;
            stress: string;
            loadPressure: string;
            liveHeartRate: string;
            activities: string;
        };
    }>;
    getSleepView(userId: string, selectedDateInput?: string): Promise<{
        selectedDate: string;
        selectedDateTitle: string;
        selectedDateSubtitle: string;
        emptyState: {
            isEmpty: boolean;
            title: string;
            subtitle: string;
            support: string;
        };
        header: {
            bedtime: string;
            wakeTime: string;
            duration: string;
            restorative: string;
            timeInBed: string;
            durationVsTypical: string;
            restorativeVsTypical: string;
        };
        sleepInsight: string | null;
        hrChart: {
            samples: {
                timestamp: string;
                value: number;
            }[];
        };
        stageRows: {
            id: string;
            label: string;
            percent: number;
            durationFormatted: string;
            color: string;
            barFraction: number;
            typicalRange: {
                lower: number;
                upper: number;
            } | null;
        }[];
        epochTimeline: {
            timestamp: string;
            stage: "rem" | "core" | "deep" | "awake" | "unknown";
        }[];
        durationTrend: {
            targetHours: number;
            samples: {
                timestamp: string;
                value: number;
            }[];
        };
        sleepScoreTrend: ({
            timestamp: string;
            value: number;
        } | null)[];
        metrics: {
            label: string;
            value: string;
            detail: string | null;
        }[];
        factorInsights: {
            factorTag: string;
            deepDelta: string | null;
            remDelta: string | null;
            sampleCount: number;
        }[];
        planner: {
            targetSleepMinutes: number;
            wakeMinutes: number;
            alarmEnabled: boolean;
            alarmMinutes: number;
            smartWakeEnabled: boolean;
            alarmStatusText: string;
            sleepReserveText: string;
            estimatedSleepHours: string;
            smartWakeStatusText: string;
        };
        confidence: {
            confidence: string;
            pipelineStatus: string;
            sourceBlend: string;
            storageMode: string;
            persistenceHealth: string;
            disclaimer: string;
        };
    }>;
    updateSleepPlan(userId: string, dto: UpdateSleepPlanDto): Promise<{
        ok: boolean;
        sleepView: {
            selectedDate: string;
            selectedDateTitle: string;
            selectedDateSubtitle: string;
            emptyState: {
                isEmpty: boolean;
                title: string;
                subtitle: string;
                support: string;
            };
            header: {
                bedtime: string;
                wakeTime: string;
                duration: string;
                restorative: string;
                timeInBed: string;
                durationVsTypical: string;
                restorativeVsTypical: string;
            };
            sleepInsight: string | null;
            hrChart: {
                samples: {
                    timestamp: string;
                    value: number;
                }[];
            };
            stageRows: {
                id: string;
                label: string;
                percent: number;
                durationFormatted: string;
                color: string;
                barFraction: number;
                typicalRange: {
                    lower: number;
                    upper: number;
                } | null;
            }[];
            epochTimeline: {
                timestamp: string;
                stage: "rem" | "core" | "deep" | "awake" | "unknown";
            }[];
            durationTrend: {
                targetHours: number;
                samples: {
                    timestamp: string;
                    value: number;
                }[];
            };
            sleepScoreTrend: ({
                timestamp: string;
                value: number;
            } | null)[];
            metrics: {
                label: string;
                value: string;
                detail: string | null;
            }[];
            factorInsights: {
                factorTag: string;
                deepDelta: string | null;
                remDelta: string | null;
                sampleCount: number;
            }[];
            planner: {
                targetSleepMinutes: number;
                wakeMinutes: number;
                alarmEnabled: boolean;
                alarmMinutes: number;
                smartWakeEnabled: boolean;
                alarmStatusText: string;
                sleepReserveText: string;
                estimatedSleepHours: string;
                smartWakeStatusText: string;
            };
            confidence: {
                confidence: string;
                pipelineStatus: string;
                sourceBlend: string;
                storageMode: string;
                persistenceHealth: string;
                disclaimer: string;
            };
        };
    }>;
    private loadDashboardData;
    private resolveSelectedDate;
    private dayKey;
    private findByDay;
    private findSleepByDayOrLatestForToday;
    private formatSelectedDateTitle;
    private isToday;
    private formatSelectedDateSubtitle;
    private normalizedPercent;
    private clamp01;
    private computeSleepAttainmentPercent;
    private buildTodayHeadline;
    private buildTodaySubheadline;
    private buildTrendSummary;
    private buildPipelineStatus;
    private toDetectionSummary;
    private toStageSummary;
    private formatDurationHours;
    private formatMinutes;
    private formatTimeOnly;
    private formatTypicalHoursDelta;
    private formatTypicalMinutesDelta;
    private buildSleepStageRows;
    private buildSleepInsight;
    private buildSleepMetrics;
    private buildAlarmStatusText;
    private buildSmartWakeStatusText;
    private nextAlarmDate;
    private formatMinutesAsTime;
    private formatDecimal;
}
