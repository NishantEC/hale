import { SyncService } from './sync.service.js';
import { PushSyncDto } from './dto/push-sync.dto.js';
export declare class SyncController {
    private readonly syncService;
    private readonly logger;
    constructor(syncService: SyncService);
    push(req: any, dto: PushSyncDto): Promise<{
        ok: boolean;
        upserted: Record<string, number>;
    }>;
    pull(req: any): Promise<{
        nightFeatures: import("../sleep/entities/night-feature.entity.js").NightFeature[];
        sleepDetections: import("../sleep/entities/sleep-detection.entity.js").SleepDetection[];
        sleepStages: import("../sleep/entities/sleep-stage.entity.js").SleepStage[];
        dailyScores: import("../wellness/entities/daily-score.entity.js").DailyScore[];
        dailyMetrics: import("../wellness/entities/daily-metric.entity.js").DailyMetric[];
        journalEntries: import("../journal/journal-entry.entity.js").JournalEntry[];
        sleepPlan: import("../plans/sleep-plan.entity.js").SleepPlan | null;
        baselineProfile: import("../plans/baseline-profile.entity.js").BaselineProfile | null;
    }>;
}
