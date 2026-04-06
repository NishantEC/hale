import { PipelineService } from './pipeline.service.js';
import { IngestDto } from './dto/ingest.dto.js';
export declare class PipelineController {
    private readonly pipelineService;
    private readonly logger;
    constructor(pipelineService: PipelineService);
    ingest(req: any, dto: IngestDto): Promise<{
        signalSamples: number;
        sensorRecords: number;
    }>;
    run(req: any): Promise<{
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
    }>;
    results(req: any): Promise<{
        nightFeatures: import("../sleep/entities/night-feature.entity.js").NightFeature[];
        sleepDetections: import("../sleep/entities/sleep-detection.entity.js").SleepDetection[];
        sleepStages: import("../sleep/entities/sleep-stage.entity.js").SleepStage[];
        dailyScores: import("../wellness/entities/daily-score.entity.js").DailyScore[];
        dailyMetrics: import("../wellness/entities/daily-metric.entity.js").DailyMetric[];
        baselineProfile: import("../plans/baseline-profile.entity.js").BaselineProfile | null;
        sleepPlan: import("../plans/sleep-plan.entity.js").SleepPlan | null;
        typicalRanges: import("../processing/interfaces.js").SleepTypicalRanges | null;
        journalCorrelations: import("../processing/interfaces.js").JournalSleepCorrelation[];
    }>;
}
