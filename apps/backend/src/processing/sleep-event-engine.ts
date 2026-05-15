import { HistoricalSensorRecord, SleepDetectionSummary } from './interfaces';
import { median, clamp, standardDeviation } from './utils';
import { calendarDayStart, clockMinutesInTimeZone } from '../common/calendar';

interface TempPeriod {
  isSleep: boolean;
  start: Date;
  end: Date;
}

export interface OffWristInterval {
  start: Date;
  end: Date;
}

interface NightGroup {
  nightDate: Date;
  bedtime: Date;
  wakeTime: Date;
  durationHours: number;
  interruptionCount: number;
  continuity: number;
  validCoverage: number;
}

const HISTORICAL_GAP_BREAK_SECONDS = 20 * 60;
const SHORT_FLIP_MERGE_SECONDS = 15 * 60;
const MIN_SLEEP_PERIOD_MS = 60 * 60 * 1000;
// Maximum gap allowed between two sleep periods to still count as the same
// "night". Anything longer means a daytime nap (or sedentary at-desk time
// mis-classified as still) — not part of the main overnight sleep.
const SAME_NIGHT_GAP_MS = 4 * 60 * 60 * 1000;

export class SleepEventEngine {
  static detect(
    records: HistoricalSensorRecord[],
    timeZone?: string,
    offWristIntervals: OffWristInterval[] = [],
  ): SleepDetectionSummary[] {
    const sorted = [...records].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    // Only records with valid gravity readings can drive sleep classification.
    // Generic-format packets (HR-only) carry null gravity; including them
    // would make every delta look like a 1g jump (gravity=null treated as 0
    // vs a real ~0.98g neighbor) and prevent any window from registering as
    // still. Reference openWhoop-2 follows the same rule (sensor=None drops
    // out of stillness analysis).
    const gravityRecords = sorted.filter(
      (r) =>
        r.gravityX != null &&
        r.gravityY != null &&
        r.gravityZ != null,
    );
    if (gravityRecords.length < 12) return [];

    const intervalSeconds = medianIntervalSeconds(gravityRecords);
    const windowSize = Math.max(
      3,
      Math.floor((15 * 60) / Math.max(intervalSeconds, 1)),
    );
    const deltas = gravityDeltas(gravityRecords);
    let isSleepFlags = classifySleep(deltas, windowSize);

    // Off-wrist gating. Three signals, in order of authority:
    //   1. Device-emitted WristOff / ChargingOn events (passed in as
    //      offWristIntervals) — authoritative when present.
    //   2. skinContact === false on a record — strap reports no contact.
    //   3. HR-fraction fallback further below (period-level).
    // Any epoch caught by 1 or 2 is forced to wake.
    const offWristSorted = sortIntervals(offWristIntervals);
    isSleepFlags = isSleepFlags.map((flag, idx) => {
      if (!flag) return false;
      const record = gravityRecords[idx];
      if (record.skinContact === false) return false;
      if (isInsideAnyInterval(record.timestamp, offWristSorted)) return false;
      return true;
    });

    // HR-assisted refinement: adjust boundary epochs based on heart rate trends
    isSleepFlags = hrAssistedRefinement(gravityRecords, isSleepFlags);

    const periods = mergePeriods(
      buildPeriods(gravityRecords, isSleepFlags),
      HISTORICAL_GAP_BREAK_SECONDS,
      SHORT_FLIP_MERGE_SECONDS,
    );
    const longSleeps = periods.filter(
      (p) =>
        p.isSleep &&
        p.end.getTime() - p.start.getTime() >= MIN_SLEEP_PERIOD_MS,
    );
    if (longSleeps.length === 0) return [];

    // Off-wrist gating (HR fallback): when skinContact is not populated
    // (older firmware/clients), still reject periods where the bulk of
    // records have heartRate <= 0. A real night has HR present for the
    // vast majority of records; a strap left on the desk reads HR=0.
    const wristContactSleeps = longSleeps.filter((period) =>
      periodHasWristContact(period, gravityRecords),
    );
    if (wristContactSleeps.length === 0) return [];

    // HR-baseline gate: sleeping HR is typically 10+ bpm below the user's
    // awake HR. A sedentary at-desk period (still gravity, HR present,
    // skinContact true) sails through the gates above — but its HR sits in
    // the awake range. Require the period's median HR to be at least
    // SLEEP_HR_OFFSET below the day's awake-window median.
    const heartRateGatedSleeps = filterByHrBelowAwakeBaseline(
      wristContactSleeps,
      gravityRecords,
    );
    if (heartRateGatedSleeps.length === 0) return [];

    const groups = groupSleepsByNight(
      heartRateGatedSleeps,
      gravityRecords,
      intervalSeconds,
      timeZone,
    );
    if (groups.length === 0) return [];

    const sortedGroups = [...groups].sort(
      (a, b) => a.nightDate.getTime() - b.nightDate.getTime(),
    );
    return sortedGroups.map((group, index) => {
      const regularity = regularityScore(index, sortedGroups, timeZone);
      const confidence = clamp(
        group.validCoverage * 0.7 + group.continuity * 0.3,
        0,
        1,
      );
      return {
        nightDate: group.nightDate,
        bedtime: group.bedtime,
        wakeTime: group.wakeTime,
        durationHours: group.durationHours,
        interruptionCount: group.interruptionCount,
        continuity: group.continuity,
        regularity,
        validCoverage: group.validCoverage,
        confidence,
      };
    });
  }
}

const WRIST_CONTACT_MIN_HR_FRACTION = 0.3;
// Sleep HR is reliably below awake HR. We require the candidate sleep
// period's median HR to be at least this much below the median HR of all
// records OUTSIDE candidate sleep periods (the "awake baseline").
const SLEEP_HR_OFFSET_BPM = 8;
// Hard ceiling on sleep HR. Real sleeping HR rarely exceeds 80 bpm. Above
// this, the period is definitionally not sleep regardless of baseline.
const SLEEP_HR_MAX_BPM = 85;

function periodHrMedian(
  period: TempPeriod,
  records: HistoricalSensorRecord[],
): number | null {
  const startMs = period.start.getTime();
  const endMs = period.end.getTime();
  const hrs: number[] = [];
  for (const r of records) {
    const ts = r.timestamp.getTime();
    if (ts < startMs || ts > endMs) continue;
    if (r.heartRate > 0) hrs.push(r.heartRate);
  }
  if (hrs.length === 0) return null;
  hrs.sort((a, b) => a - b);
  return hrs[Math.floor(hrs.length / 2)];
}

function filterByHrBelowAwakeBaseline(
  candidates: TempPeriod[],
  records: HistoricalSensorRecord[],
): TempPeriod[] {
  if (candidates.length === 0) return [];
  // Build the awake baseline: HR values from records OUTSIDE all candidates.
  const sortedCandidates = [...candidates].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const awakeHrs: number[] = [];
  for (const r of records) {
    if (r.heartRate <= 0) continue;
    const ts = r.timestamp.getTime();
    let insideCandidate = false;
    for (const c of sortedCandidates) {
      if (c.start.getTime() > ts) break;
      if (c.end.getTime() >= ts) {
        insideCandidate = true;
        break;
      }
    }
    if (!insideCandidate) awakeHrs.push(r.heartRate);
  }
  // If we don't have enough awake samples to estimate baseline, skip the
  // gate (degrades gracefully on cold-start / partial data).
  if (awakeHrs.length < 30) {
    return candidates.filter((p) => {
      const m = periodHrMedian(p, records);
      return m == null || m <= SLEEP_HR_MAX_BPM;
    });
  }
  awakeHrs.sort((a, b) => a - b);
  const awakeMedian = awakeHrs[Math.floor(awakeHrs.length / 2)];
  return candidates.filter((p) => {
    const m = periodHrMedian(p, records);
    if (m == null) return true;
    if (m > SLEEP_HR_MAX_BPM) return false;
    return m <= awakeMedian - SLEEP_HR_OFFSET_BPM;
  });
}

function sortIntervals(intervals: OffWristInterval[]): OffWristInterval[] {
  return [...intervals]
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function isInsideAnyInterval(
  timestamp: Date,
  sortedIntervals: OffWristInterval[],
): boolean {
  if (sortedIntervals.length === 0) return false;
  const ts = timestamp.getTime();
  // Linear scan is fine; off-wrist intervals per night are typically <20.
  for (const interval of sortedIntervals) {
    if (interval.start.getTime() > ts) return false;
    if (interval.end.getTime() >= ts) return true;
  }
  return false;
}

// Maximum off-wrist interval we'll accept. Real off-wrist durations
// (charging, overnight removal) are bounded; longer means the closing
// event was lost over BLE, so we cap to avoid over-filtering legitimate
// sleep. Beyond this cap the engine falls back to skinContact + HR gating.
const MAX_OFF_WRIST_MS = 24 * 60 * 60 * 1000;

/**
 * Build off-wrist intervals from device events. WristOff/ChargingOn opens
 * an interval; the next matching WristOn/ChargingOff closes it. Unclosed
 * intervals (still off-wrist at end of window) close at the earlier of
 * `windowEnd` or `open + MAX_OFF_WRIST_MS` — preventing a missed close
 * event from blanket-filtering days of data.
 */
export function buildOffWristIntervals(
  events: Array<{ eventNumber: number; capturedAt: Date }>,
  windowEnd: Date,
): OffWristInterval[] {
  const sorted = [...events].sort(
    (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime(),
  );
  const intervals: OffWristInterval[] = [];
  // WristOff (10) and ChargingOn (7) open; WristOn (9) and ChargingOff (8) close.
  // Track each axis independently so a WristOff during charging doesn't
  // collapse the two intervals.
  let wristOffOpen: Date | null = null;
  let chargingOpen: Date | null = null;
  const pushBounded = (start: Date, end: Date) => {
    const cap = new Date(start.getTime() + MAX_OFF_WRIST_MS);
    const boundedEnd = end.getTime() > cap.getTime() ? cap : end;
    intervals.push({ start, end: boundedEnd });
  };
  for (const e of sorted) {
    if (e.eventNumber === 10 && wristOffOpen == null) {
      wristOffOpen = e.capturedAt;
    } else if (e.eventNumber === 9 && wristOffOpen != null) {
      pushBounded(wristOffOpen, e.capturedAt);
      wristOffOpen = null;
    } else if (e.eventNumber === 7 && chargingOpen == null) {
      chargingOpen = e.capturedAt;
    } else if (e.eventNumber === 8 && chargingOpen != null) {
      pushBounded(chargingOpen, e.capturedAt);
      chargingOpen = null;
    }
  }
  if (wristOffOpen != null) pushBounded(wristOffOpen, windowEnd);
  if (chargingOpen != null) pushBounded(chargingOpen, windowEnd);
  return intervals;
}

function pickNightCluster(periods: TempPeriod[]): TempPeriod[] {
  if (periods.length <= 1) return periods;
  const sorted = [...periods].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  // Walk forward from the longest period in both directions, including any
  // neighbor whose gap to the cluster is < SAME_NIGHT_GAP_MS.
  let anchorIdx = 0;
  let anchorLen = 0;
  for (let i = 0; i < sorted.length; i++) {
    const len = sorted[i].end.getTime() - sorted[i].start.getTime();
    if (len > anchorLen) {
      anchorLen = len;
      anchorIdx = i;
    }
  }
  const cluster: TempPeriod[] = [sorted[anchorIdx]];
  // Expand backward
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const gap = cluster[0].start.getTime() - sorted[i].end.getTime();
    if (gap > SAME_NIGHT_GAP_MS) break;
    cluster.unshift(sorted[i]);
  }
  // Expand forward
  for (let i = anchorIdx + 1; i < sorted.length; i++) {
    const gap = sorted[i].start.getTime() - cluster[cluster.length - 1].end.getTime();
    if (gap > SAME_NIGHT_GAP_MS) break;
    cluster.push(sorted[i]);
  }
  return cluster;
}

function periodHasWristContact(
  period: TempPeriod,
  records: HistoricalSensorRecord[],
): boolean {
  const startMs = period.start.getTime();
  const endMs = period.end.getTime();
  let total = 0;
  let withHr = 0;
  let explicitOffWrist = 0;
  for (const r of records) {
    const ts = r.timestamp.getTime();
    if (ts < startMs || ts > endMs) continue;
    total++;
    if (r.heartRate > 0) withHr++;
    if (r.skinContact === false) explicitOffWrist++;
  }
  if (total === 0) return false;
  // If the strap explicitly reported off-wrist for the majority of the
  // period, drop it even if some HR happened to be present.
  if (explicitOffWrist / total > 0.5) return false;
  return withHr / total >= WRIST_CONTACT_MIN_HR_FRACTION;
}

function gravityMagnitude(
  record: HistoricalSensorRecord,
): number | null {
  if (record.gravityMagnitude != null) {
    return record.gravityMagnitude;
  }
  if (
    record.gravityX == null ||
    record.gravityY == null ||
    record.gravityZ == null
  ) {
    return null;
  }
  return Math.sqrt(
    record.gravityX * record.gravityX +
      record.gravityY * record.gravityY +
      record.gravityZ * record.gravityZ,
  );
}

function gravityDeltas(records: HistoricalSensorRecord[]): number[] {
  if (records.length === 0) return [];
  // Caller has already filtered to records with non-null gravityX/Y/Z, so
  // gravityMagnitude() never returns null here.
  const deltas: number[] = [0];
  for (let idx = 1; idx < records.length; idx++) {
    const current = gravityMagnitude(records[idx]) ?? 0;
    const previous = gravityMagnitude(records[idx - 1]) ?? 0;
    deltas.push(Math.abs(current - previous));
  }
  return deltas;
}

function classifySleep(deltas: number[], windowSize: number): boolean[] {
  if (deltas.length === 0) return [];
  const half = Math.max(1, Math.floor(windowSize / 2));
  return deltas.map((_, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(deltas.length, index + half + 1);
    const window = deltas.slice(start, end);
    const stillCount = window.filter((d) => d < 0.01).length;
    const stillFraction = stillCount / Math.max(1, window.length);
    return stillFraction >= 0.7;
  });
}

function buildPeriods(
  records: HistoricalSensorRecord[],
  sleepFlags: boolean[],
): TempPeriod[] {
  if (
    records.length !== sleepFlags.length ||
    records.length === 0
  ) {
    return [];
  }
  const periods: TempPeriod[] = [];
  let runStart = 0;
  for (let idx = 1; idx <= records.length; idx++) {
    const endOfData = idx === records.length;
    const classChange =
      !endOfData && sleepFlags[idx] !== sleepFlags[runStart];
    const gapBreak =
      !endOfData &&
      records[idx].timestamp.getTime() -
        records[idx - 1].timestamp.getTime() >
        HISTORICAL_GAP_BREAK_SECONDS * 1000;
    if (endOfData || classChange || gapBreak) {
      periods.push({
        isSleep: sleepFlags[runStart],
        start: records[runStart].timestamp,
        end: records[idx - 1].timestamp,
      });
      if (!endOfData) {
        runStart = idx;
      }
    }
  }
  return periods;
}

function mergePeriods(
  periods: TempPeriod[],
  gapBreakSeconds: number,
  flipMergeSeconds: number,
): TempPeriod[] {
  if (periods.length === 0) return [];
  const gapBreakMs = gapBreakSeconds * 1000;
  const flipMergeMs = flipMergeSeconds * 1000;
  const merged: TempPeriod[] = [];
  let index = 0;

  while (index < periods.length) {
    const current = periods[index];
    const currentDuration =
      current.end.getTime() - current.start.getTime();
    if (
      currentDuration < flipMergeMs &&
      index > 0 &&
      index + 1 < periods.length &&
      periods[index - 1].isSleep === periods[index + 1].isSleep &&
      periods[index + 1].start.getTime() -
        periods[index - 1].end.getTime() <=
        gapBreakMs
    ) {
      if (merged.length > 0) {
        const previous = merged.pop()!;
        merged.push({
          ...previous,
          end: periods[index + 1].end,
        });
      } else {
        merged.push({
          isSleep: periods[index - 1].isSleep,
          start: periods[index - 1].start,
          end: periods[index + 1].end,
        });
      }
      index += 2;
      continue;
    }
    const last = merged.length > 0 ? merged[merged.length - 1] : null;
    if (
      last &&
      last.isSleep === current.isSleep &&
      current.start.getTime() - last.end.getTime() <= gapBreakMs
    ) {
      const updated = merged.pop()!;
      merged.push({ ...updated, end: current.end });
    } else {
      merged.push({ ...current });
    }
    index += 1;
  }
  return merged;
}

function startOfDay(date: Date, timeZone?: string): Date {
  return calendarDayStart(date, timeZone);
}

function groupSleepsByNight(
  sleepPeriods: TempPeriod[],
  records: HistoricalSensorRecord[],
  intervalSeconds: number,
  timeZone?: string,
): NightGroup[] {
  // First pass: group periods by calendar day of end time.
  const grouped = new Map<number, TempPeriod[]>();
  for (const period of sleepPeriods) {
    const day = startOfDay(period.end, timeZone);
    const key = Math.floor(day.getTime() / 1000);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(period);
    } else {
      grouped.set(key, [period]);
    }
  }

  // Second pass: within each calendar day, only keep periods that are
  // within SAME_NIGHT_GAP_MS of the main sleep block. The main block is
  // the longest single period; daytime stationary/desk time mis-classified
  // as sleep typically lives many hours away from the actual night.
  const results: NightGroup[] = [];
  for (const [, periodsForDay] of grouped) {
    const dayPeriods = pickNightCluster(periodsForDay);
    if (dayPeriods.length === 0) continue;
    const sorted = [...dayPeriods].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSleep = sorted.reduce(
      (sum, p) => sum + (p.end.getTime() - p.start.getTime()),
      0,
    );
    const durationHours = totalSleep / (3600 * 1000);
    const interruptionCount = Math.max(0, sorted.length - 1);
    const envelope = Math.max(
      1,
      last.end.getTime() - first.start.getTime(),
    );
    const interruptionMinutes = Math.max(
      0,
      (envelope - totalSleep) / (60 * 1000),
    );
    const continuity = clamp(1 - interruptionMinutes / 120, 0, 1);
    const validCoverage = estimateCoverage(
      records,
      first.start,
      last.end,
      intervalSeconds,
    );
    results.push({
      nightDate: startOfDay(last.end, timeZone),
      bedtime: first.start,
      wakeTime: last.end,
      durationHours,
      interruptionCount,
      continuity,
      validCoverage,
    });
  }
  return results;
}

function estimateCoverage(
  records: HistoricalSensorRecord[],
  start: Date,
  end: Date,
  intervalSeconds: number,
): number {
  if (end.getTime() <= start.getTime()) return 0;
  const observed = records.filter(
    (r) =>
      r.timestamp.getTime() >= start.getTime() &&
      r.timestamp.getTime() <= end.getTime(),
  ).length;
  const spanSeconds =
    (end.getTime() - start.getTime()) / 1000;
  const expected = Math.max(
    1,
    Math.round(spanSeconds / Math.max(intervalSeconds, 1)),
  );
  return Math.min(1, observed / Math.max(1, expected));
}

function regularityScore(
  index: number,
  groups: NightGroup[],
  timeZone?: string,
): number {
  const start = Math.max(0, index - 6);
  const recent = groups.slice(start, index + 1);
  if (recent.length < 3) return 0.65;
  const bedMinutes = recent.map((g) => clockMinutesInTimeZone(g.bedtime, timeZone));
  const wakeMinutes = recent.map((g) => clockMinutesInTimeZone(g.wakeTime, timeZone));
  const bedStd = standardDeviation(bedMinutes);
  const wakeStd = standardDeviation(wakeMinutes);
  const penalty = Math.min(1.0, (bedStd + wakeStd) / 180.0);
  return Math.max(0, 1 - penalty);
}

function medianIntervalSeconds(
  records: HistoricalSensorRecord[],
): number {
  if (records.length <= 2) return 60.0;
  const intervals: number[] = [];
  for (let i = 1; i < records.length; i++) {
    const diff =
      Math.max(
        1.0,
        (records[i].timestamp.getTime() -
          records[i - 1].timestamp.getTime()) /
          1000,
      );
    if (diff < 300.0) {
      intervals.push(diff);
    }
  }
  if (intervals.length === 0) return 60.0;
  intervals.sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)];
}

/**
 * Refine gravity-based sleep/wake flags using heart rate trends.
 * At transition boundaries:
 * - "Wake" epochs with HR below nightMedianHR - 1*std → reclassify as sleep
 * - "Sleep" epochs with HR above nightMedianHR + 2*std → flag as wake
 */
function hrAssistedRefinement(
  records: HistoricalSensorRecord[],
  flags: boolean[],
): boolean[] {
  const heartRates = records.map((r) => r.heartRate).filter((hr) => hr > 0);
  if (heartRates.length < 20) return flags;

  const sorted = [...heartRates].sort((a, b) => a - b);
  const nightMedianHR = sorted[Math.floor(sorted.length / 2)];
  const hrStd = standardDeviation(heartRates);
  if (hrStd <= 0) return flags;

  const lowThreshold = nightMedianHR - hrStd;
  const highThreshold = nightMedianHR + 2 * hrStd;

  const refined = [...flags];
  for (let i = 1; i < refined.length - 1; i++) {
    // Only refine at transition boundaries (where adjacent flags differ)
    const isTransition = refined[i - 1] !== refined[i] || refined[i] !== refined[i + 1];
    if (!isTransition) continue;

    const hr = records[i].heartRate;
    if (hr <= 0) continue;

    // Wake epoch with low HR → likely sleep
    if (!refined[i] && hr < lowThreshold) {
      refined[i] = true;
    }
    // Sleep epoch with very high HR → likely wake
    if (refined[i] && hr > highThreshold) {
      refined[i] = false;
    }
  }
  return refined;
}
