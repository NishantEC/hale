import { Repository } from 'typeorm';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity.js';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { ViewsService } from '../views/views.service.js';
type SelectionMode = 'exactMatch' | 'fallbackToLatestCompletedNight' | 'noNightAvailable';
export declare class DebugService {
    private readonly pipelineService;
    private readonly viewsService;
    private readonly rawSensorRepo;
    private readonly sleepDetectionRepo;
    private readonly sleepStageRepo;
    private readonly nightFeatureRepo;
    private readonly dailyScoreRepo;
    private readonly dailyMetricRepo;
    private readonly sleepPlanRepo;
    private readonly enabled;
    constructor(pipelineService: PipelineService, viewsService: ViewsService, rawSensorRepo: Repository<RawSensorRecord>, sleepDetectionRepo: Repository<SleepDetection>, sleepStageRepo: Repository<SleepStage>, nightFeatureRepo: Repository<NightFeature>, dailyScoreRepo: Repository<DailyScore>, dailyMetricRepo: Repository<DailyMetric>, sleepPlanRepo: Repository<SleepPlan>);
    assertEnabled(): void;
    getOverview(userId: string, dateInput?: string): Promise<{
        selectedDate: string;
        selectedDateTitle: string;
        selectedDateSubtitle: string;
        selectedNightDate: string | null;
        selectionMode: SelectionMode;
        selectionReason: string;
        counts: {
            rawRecordCount: number;
            sleepDetectionCount: number;
            sleepStageCount: number;
            dailyScoreCount: number;
            dailyMetricCount: number;
            selectedDayRawRecordCount: number;
        };
        earliestRawTimestamp: string | null;
        latestRawTimestamp: string | null;
        latestSyncMetadata: {
            lastRawRecordAt: string | null;
            lastSleepPlanUpdateAt: string | null;
            plannerConfigured: boolean;
        };
        selectedEntities: {
            detectionId: string | null;
            stageId: string | null;
            featureId: string | null;
            epochTimelineCount: number;
        };
        lastPipelineRunStatus: string;
        viewSummary: {
            home: {
                title: string;
                headline: string;
                recommendation: string;
            };
            sleep: {
                title: string;
                isEmpty: boolean;
                bedtime: string;
                wakeTime: string;
            };
        };
    }>;
    getRawRecords(userId: string, dateInput?: string, limit?: number): Promise<{
        selectedDate: string;
        startTimestamp: string;
        endTimestamp: string;
        count: number;
        rows: {
            id: string;
            timestamp: string;
            heartRate: number;
            rrAverageMs: number;
            skinContact: boolean;
            gravityMagnitude: number;
            gravityX: number;
            gravityY: number;
            gravityZ: number;
            respRateRaw: number;
            spo2Red: number;
            spo2IR: number;
            skinTempRaw: number;
        }[];
    }>;
    getSleepNight(userId: string, dateInput?: string): Promise<{
        selectedDate: string;
        selectedNightDate: string | null;
        selectionMode: SelectionMode;
        selectionReason: string;
        selectedDetection: {
            id: string;
            nightDate: string;
            bedtime: string;
            wakeTime: string;
            durationHours: number;
            interruptionCount: number;
            continuity: number;
            regularity: number;
            validCoverage: number;
            confidence: number;
        } | null;
        selectedStage: {
            id: string;
            nightDate: string;
            remMinutes: number;
            coreMinutes: number;
            deepMinutes: number;
            awakeMinutes: number;
            unknownMinutes: number;
            confidence: number;
            source: string;
            epochMinutes: number;
        } | null;
        selectedNightFeature: {
            id: string;
            nightDate: string;
            restingHeartRate: number;
            rmssd: number;
            sdnn: number;
            respiratoryRate: number;
            continuity: number;
            regularity: number;
            validCoverage: number;
            confidenceRaw: number;
            sleepEstimateHours: number;
            sourceBlend: string;
        } | null;
        stageTotals: {
            remMinutes: number;
            lightMinutes: number;
            deepMinutes: number;
            awakeMinutes: number;
            unknownMinutes: number;
        } | null;
        epochTimelineCount: number;
        epochTimeline: {
            timestamp: string;
            stage: any;
        }[];
    }>;
    getPipelineResults(userId: string): Promise<{
        rawRecordCount: number;
        earliestRawTimestamp: string | null;
        latestRawTimestamp: string | null;
        results: {
            nightFeatures: NightFeature[];
            sleepDetections: SleepDetection[];
            sleepStages: SleepStage[];
            dailyScores: DailyScore[];
            dailyMetrics: DailyMetric[];
            baselineProfile: import("../plans/baseline-profile.entity.js").BaselineProfile | null;
            sleepPlan: SleepPlan | null;
            typicalRanges: import("../processing/interfaces.js").SleepTypicalRanges | null;
            journalCorrelations: import("../processing/interfaces.js").JournalSleepCorrelation[];
        };
    }>;
    runPipeline(userId: string, dateInput?: string): Promise<{
        runResult: {
            ok: boolean;
            computed: {
                nightFeatures: number;
                sleepDetections: number;
                sleepStages: number;
                dailyScore: number;
                derivedMetrics: number;
                sleepScore: number | null;
                typicalRanges: number;
                journalCorrelations: number;
            };
        };
        overview: {
            selectedDate: string;
            selectedDateTitle: string;
            selectedDateSubtitle: string;
            selectedNightDate: string | null;
            selectionMode: SelectionMode;
            selectionReason: string;
            counts: {
                rawRecordCount: number;
                sleepDetectionCount: number;
                sleepStageCount: number;
                dailyScoreCount: number;
                dailyMetricCount: number;
                selectedDayRawRecordCount: number;
            };
            earliestRawTimestamp: string | null;
            latestRawTimestamp: string | null;
            latestSyncMetadata: {
                lastRawRecordAt: string | null;
                lastSleepPlanUpdateAt: string | null;
                plannerConfigured: boolean;
            };
            selectedEntities: {
                detectionId: string | null;
                stageId: string | null;
                featureId: string | null;
                epochTimelineCount: number;
            };
            lastPipelineRunStatus: string;
            viewSummary: {
                home: {
                    title: string;
                    headline: string;
                    recommendation: string;
                };
                sleep: {
                    title: string;
                    isEmpty: boolean;
                    bedtime: string;
                    wakeTime: string;
                };
            };
        };
    }>;
    recomputeViews(userId: string, dateInput?: string): Promise<{
        selectedDate: string;
        homeView: {
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
        };
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
        overview: {
            selectedDate: string;
            selectedDateTitle: string;
            selectedDateSubtitle: string;
            selectedNightDate: string | null;
            selectionMode: SelectionMode;
            selectionReason: string;
            counts: {
                rawRecordCount: number;
                sleepDetectionCount: number;
                sleepStageCount: number;
                dailyScoreCount: number;
                dailyMetricCount: number;
                selectedDayRawRecordCount: number;
            };
            earliestRawTimestamp: string | null;
            latestRawTimestamp: string | null;
            latestSyncMetadata: {
                lastRawRecordAt: string | null;
                lastSleepPlanUpdateAt: string | null;
                plannerConfigured: boolean;
            };
            selectedEntities: {
                detectionId: string | null;
                stageId: string | null;
                featureId: string | null;
                epochTimelineCount: number;
            };
            lastPipelineRunStatus: string;
            viewSummary: {
                home: {
                    title: string;
                    headline: string;
                    recommendation: string;
                };
                sleep: {
                    title: string;
                    isEmpty: boolean;
                    bedtime: string;
                    wakeTime: string;
                };
            };
        };
    }>;
    private resolveSelectedDate;
    private dayKey;
    private localDayBounds;
    private isToday;
    private selectByDayOrLatestForToday;
    private pickSelectionMode;
    private selectionReason;
    private formatSelectedDateTitle;
    private formatSelectedDateSubtitle;
}
export {};
