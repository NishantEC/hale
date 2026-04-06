import { Repository } from 'typeorm';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SignalSample } from '../wellness/entities/signal-sample.entity.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { PushSyncDto } from './dto/push-sync.dto.js';
export declare class SyncService {
    private sleepDetectionRepo;
    private sleepStageRepo;
    private nightFeatureRepo;
    private dailyScoreRepo;
    private dailyMetricRepo;
    private signalSampleRepo;
    private journalEntryRepo;
    private sleepPlanRepo;
    private baselineProfileRepo;
    constructor(sleepDetectionRepo: Repository<SleepDetection>, sleepStageRepo: Repository<SleepStage>, nightFeatureRepo: Repository<NightFeature>, dailyScoreRepo: Repository<DailyScore>, dailyMetricRepo: Repository<DailyMetric>, signalSampleRepo: Repository<SignalSample>, journalEntryRepo: Repository<JournalEntry>, sleepPlanRepo: Repository<SleepPlan>, baselineProfileRepo: Repository<BaselineProfile>);
    push(userId: string, dto: PushSyncDto): Promise<Record<string, number>>;
    pull(userId: string): Promise<{
        nightFeatures: NightFeature[];
        sleepDetections: SleepDetection[];
        sleepStages: SleepStage[];
        dailyScores: DailyScore[];
        dailyMetrics: DailyMetric[];
        journalEntries: JournalEntry[];
        sleepPlan: SleepPlan | null;
        baselineProfile: BaselineProfile | null;
    }>;
}
