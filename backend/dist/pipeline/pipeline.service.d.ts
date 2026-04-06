import { Repository } from 'typeorm';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity.js';
import { SleepStage } from '../sleep/entities/sleep-stage.entity.js';
import { NightFeature } from '../sleep/entities/night-feature.entity.js';
import { DailyScore } from '../wellness/entities/daily-score.entity.js';
import { DailyMetric } from '../wellness/entities/daily-metric.entity.js';
import { SignalSample as SignalSampleEntity } from '../wellness/entities/signal-sample.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { SleepPlan } from '../plans/sleep-plan.entity.js';
import { RawSensorRecord } from './entities/raw-sensor-record.entity.js';
import { IngestDto } from './dto/ingest.dto.js';
export declare class PipelineService {
    private sleepDetectionRepo;
    private sleepStageRepo;
    private nightFeatureRepo;
    private dailyScoreRepo;
    private dailyMetricRepo;
    private signalSampleRepo;
    private baselineRepo;
    private journalRepo;
    private sleepPlanRepo;
    private rawSensorRepo;
    private readonly logger;
    constructor(sleepDetectionRepo: Repository<SleepDetection>, sleepStageRepo: Repository<SleepStage>, nightFeatureRepo: Repository<NightFeature>, dailyScoreRepo: Repository<DailyScore>, dailyMetricRepo: Repository<DailyMetric>, signalSampleRepo: Repository<SignalSampleEntity>, baselineRepo: Repository<BaselineProfile>, journalRepo: Repository<JournalEntry>, sleepPlanRepo: Repository<SleepPlan>, rawSensorRepo: Repository<RawSensorRecord>);
    ingest(userId: string, dto: IngestDto): Promise<{
        signalSamples: number;
        sensorRecords: number;
    }>;
    runPipeline(userId: string): Promise<{
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
    getResults(userId: string): Promise<{
        nightFeatures: NightFeature[];
        sleepDetections: SleepDetection[];
        sleepStages: SleepStage[];
        dailyScores: DailyScore[];
        dailyMetrics: DailyMetric[];
        baselineProfile: BaselineProfile | null;
        sleepPlan: SleepPlan | null;
        typicalRanges: import("../processing/interfaces.js").SleepTypicalRanges | null;
        journalCorrelations: import("../processing/interfaces.js").JournalSleepCorrelation[];
    }>;
    private upsertNightFeature;
    private upsertSleepDetection;
    private upsertSleepStage;
    private upsertDailyScore;
    private upsertDailyMetric;
    private upsertBaseline;
    private deriveSignalSamplesFromSensorRecords;
    private collectReferenceDays;
    private startOfDay;
    private dayKey;
}
