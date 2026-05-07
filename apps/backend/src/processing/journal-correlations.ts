import {
  JournalFactorEntry,
  JournalSleepCorrelation,
  SleepStageSummary,
  SleepDetectionSummary,
} from './interfaces';
import { dayKey } from './utils';

export function journalSleepCorrelations(
  journalEntries: JournalFactorEntry[],
  sleepStageSummaries: SleepStageSummary[],
  sleepDetectionSummaries: SleepDetectionSummary[],
): JournalSleepCorrelation[] {
  if (journalEntries.length === 0 || sleepStageSummaries.length < 3) return [];

  const stagesByDay = new Map<number, SleepStageSummary[]>();
  for (const s of sleepStageSummaries) {
    const key = dayKey(s.nightDate);
    const arr = stagesByDay.get(key) ?? [];
    arr.push(s);
    stagesByDay.set(key, arr);
  }

  const detectionsByDay = new Map<number, SleepDetectionSummary[]>();
  for (const d of sleepDetectionSummaries) {
    const key = dayKey(d.nightDate);
    const arr = detectionsByDay.get(key) ?? [];
    arr.push(d);
    detectionsByDay.set(key, arr);
  }

  const validStages = sleepStageSummaries.filter((s) => {
    const total =
      s.remMinutes +
      s.coreMinutes +
      s.deepMinutes +
      s.awakeMinutes +
      s.unknownMinutes;
    return total > 0;
  });
  const allDeep = validStages.map((s) => s.deepMinutes);
  const allRem = validStages.map((s) => s.remMinutes);
  const allDuration = sleepDetectionSummaries.map((d) => d.durationHours);

  if (allDeep.length === 0 || allDuration.length === 0) return [];

  const avgDeep = allDeep.reduce((a, b) => a + b, 0) / allDeep.length;
  const avgRem = allRem.reduce((a, b) => a + b, 0) / allRem.length;
  const avgDuration =
    allDuration.reduce((a, b) => a + b, 0) / allDuration.length;

  // Group entries by factorTag
  const byTag = new Map<string, JournalFactorEntry[]>();
  for (const entry of journalEntries) {
    const arr = byTag.get(entry.factorTag) ?? [];
    arr.push(entry);
    byTag.set(entry.factorTag, arr);
  }

  const results: JournalSleepCorrelation[] = [];

  for (const [tag, tagged] of byTag) {
    const taggedDays = new Set(tagged.map((e) => dayKey(e.timestamp)));
    if (taggedDays.size < 2) continue;

    const tagDeep: number[] = [];
    const tagRem: number[] = [];
    const tagDuration: number[] = [];

    for (const day of taggedDays) {
      const stages = stagesByDay.get(day);
      if (stages && stages.length > 0) {
        const s = stages[0];
        const total =
          s.remMinutes +
          s.coreMinutes +
          s.deepMinutes +
          s.awakeMinutes +
          s.unknownMinutes;
        if (total > 0) {
          tagDeep.push(s.deepMinutes);
          tagRem.push(s.remMinutes);
        }
      }
      const detections = detectionsByDay.get(day);
      if (detections && detections.length > 0) {
        tagDuration.push(detections[0].durationHours);
      }
    }

    if (tagDeep.length === 0) continue;

    const tagAvgDeep =
      tagDeep.reduce((a, b) => a + b, 0) / tagDeep.length;
    const tagAvgRem =
      tagRem.reduce((a, b) => a + b, 0) / tagRem.length;
    const tagAvgDuration =
      tagDuration.length === 0
        ? 0
        : tagDuration.reduce((a, b) => a + b, 0) / tagDuration.length;

    const deepDelta = tagAvgDeep - avgDeep;
    const remDelta = tagAvgRem - avgRem;
    const durationDelta = tagAvgDuration - avgDuration;

    if (
      Math.abs(deepDelta) > 2 ||
      Math.abs(remDelta) > 2 ||
      Math.abs(durationDelta) > 0.1
    ) {
      results.push({
        factorTag: tag,
        avgDeepDelta: deepDelta,
        avgRemDelta: remDelta,
        avgDurationDelta: durationDelta,
        sampleCount: taggedDays.size,
      });
    }
  }

  return results.sort(
    (a, b) =>
      Math.abs(b.avgDeepDelta) +
      Math.abs(b.avgRemDelta) -
      (Math.abs(a.avgDeepDelta) + Math.abs(a.avgRemDelta)),
  );
}
