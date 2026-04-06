import { JournalFactorEntry, JournalSleepCorrelation, SleepStageSummary, SleepDetectionSummary } from './interfaces';
export declare function journalSleepCorrelations(journalEntries: JournalFactorEntry[], sleepStageSummaries: SleepStageSummary[], sleepDetectionSummaries: SleepDetectionSummary[]): JournalSleepCorrelation[];
