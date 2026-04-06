import { UpdateSleepPlanDto } from './dto/update-sleep-plan.dto.js';
import { ViewsService } from './views.service.js';
export declare class ViewsController {
    private readonly viewsService;
    private readonly logger;
    constructor(viewsService: ViewsService);
    home(req: any, date?: string): Promise<{
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
    sleep(req: any, date?: string): Promise<{
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
    updateSleepPlan(req: any, dto: UpdateSleepPlanDto): Promise<{
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
}
