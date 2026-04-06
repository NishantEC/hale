import { DebugDateQueryDto } from './dto/debug-date-query.dto.js';
import { DebugRawRecordsQueryDto } from './dto/debug-raw-records-query.dto.js';
import { DebugService } from './debug.service.js';
export declare class DebugController {
    private readonly debugService;
    private readonly logger;
    constructor(debugService: DebugService);
    getOverview(req: any, query: DebugDateQueryDto): Promise<{
        selectedDate: string;
        selectedDateTitle: string;
        selectedDateSubtitle: string;
        selectedNightDate: string | null;
        selectionMode: "exactMatch" | "fallbackToLatestCompletedNight" | "noNightAvailable";
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
    getRawRecords(req: any, query: DebugRawRecordsQueryDto): Promise<{
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
    getSleepNight(req: any, query: DebugDateQueryDto): Promise<{
        selectedDate: string;
        selectedNightDate: string | null;
        selectionMode: "exactMatch" | "fallbackToLatestCompletedNight" | "noNightAvailable";
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
    getPipelineResults(req: any): Promise<{
        rawRecordCount: number;
        earliestRawTimestamp: string | null;
        latestRawTimestamp: string | null;
        results: {
            nightFeatures: import("../sleep/entities/night-feature.entity.js").NightFeature[];
            sleepDetections: import("../sleep/entities/sleep-detection.entity.js").SleepDetection[];
            sleepStages: import("../sleep/entities/sleep-stage.entity.js").SleepStage[];
            dailyScores: import("../wellness/entities/daily-score.entity.js").DailyScore[];
            dailyMetrics: import("../wellness/entities/daily-metric.entity.js").DailyMetric[];
            baselineProfile: import("../plans/baseline-profile.entity.js").BaselineProfile | null;
            sleepPlan: import("../plans/sleep-plan.entity.js").SleepPlan | null;
            typicalRanges: import("../processing/interfaces.js").SleepTypicalRanges | null;
            journalCorrelations: import("../processing/interfaces.js").JournalSleepCorrelation[];
        };
    }>;
    runPipeline(req: any, query: DebugDateQueryDto): Promise<{
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
            selectionMode: "exactMatch" | "fallbackToLatestCompletedNight" | "noNightAvailable";
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
    recomputeViews(req: any, query: DebugDateQueryDto): Promise<{
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
            selectionMode: "exactMatch" | "fallbackToLatestCompletedNight" | "noNightAvailable";
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
}
