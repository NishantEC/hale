"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepEventEngine = void 0;
const utils_1 = require("./utils");
class SleepEventEngine {
    static detect(records) {
        const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        if (sorted.length < 12)
            return [];
        const intervalSeconds = medianIntervalSeconds(sorted);
        const windowSize = Math.max(3, Math.floor((15 * 60) / Math.max(intervalSeconds, 1)));
        const deltas = gravityDeltas(sorted);
        const isSleepFlags = classifySleep(deltas, windowSize);
        const periods = mergePeriods(buildPeriods(sorted, isSleepFlags), 20 * 60, 15 * 60);
        const longSleeps = periods.filter((p) => p.isSleep &&
            p.end.getTime() - p.start.getTime() >= 60 * 60 * 1000);
        if (longSleeps.length === 0)
            return [];
        const groups = groupSleepsByNight(longSleeps, sorted, intervalSeconds);
        if (groups.length === 0)
            return [];
        const sortedGroups = [...groups].sort((a, b) => a.nightDate.getTime() - b.nightDate.getTime());
        return sortedGroups.map((group, index) => {
            const regularity = regularityScore(index, sortedGroups);
            const confidence = (0, utils_1.clamp)(group.validCoverage * 0.7 + group.continuity * 0.3, 0, 1);
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
exports.SleepEventEngine = SleepEventEngine;
function gravityMagnitude(record) {
    if (record.gravityMagnitude != null) {
        return record.gravityMagnitude;
    }
    if (record.gravityX == null ||
        record.gravityY == null ||
        record.gravityZ == null) {
        return null;
    }
    return Math.sqrt(record.gravityX * record.gravityX +
        record.gravityY * record.gravityY +
        record.gravityZ * record.gravityZ);
}
function gravityDeltas(records) {
    if (records.length === 0)
        return [];
    const deltas = [0];
    for (let idx = 1; idx < records.length; idx++) {
        const current = gravityMagnitude(records[idx]);
        const previous = gravityMagnitude(records[idx - 1]);
        if (current != null && previous != null) {
            deltas.push(Math.abs(current - previous));
        }
        else {
            deltas.push(Number.MAX_VALUE);
        }
    }
    return deltas;
}
function classifySleep(deltas, windowSize) {
    if (deltas.length === 0)
        return [];
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
function buildPeriods(records, sleepFlags) {
    if (records.length !== sleepFlags.length ||
        records.length === 0) {
        return [];
    }
    const periods = [];
    let runStart = 0;
    for (let idx = 1; idx <= records.length; idx++) {
        const endOfData = idx === records.length;
        const classChange = !endOfData && sleepFlags[idx] !== sleepFlags[runStart];
        const gapBreak = !endOfData &&
            records[idx].timestamp.getTime() -
                records[idx - 1].timestamp.getTime() >
                20 * 60 * 1000;
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
function mergePeriods(periods, gapBreakSeconds, flipMergeSeconds) {
    if (periods.length === 0)
        return [];
    const gapBreakMs = gapBreakSeconds * 1000;
    const flipMergeMs = flipMergeSeconds * 1000;
    const merged = [];
    let index = 0;
    while (index < periods.length) {
        const current = periods[index];
        const currentDuration = current.end.getTime() - current.start.getTime();
        if (currentDuration < flipMergeMs &&
            index > 0 &&
            index + 1 < periods.length &&
            periods[index - 1].isSleep === periods[index + 1].isSleep &&
            periods[index + 1].start.getTime() -
                periods[index - 1].end.getTime() <=
                gapBreakMs) {
            if (merged.length > 0) {
                const previous = merged.pop();
                merged.push({
                    ...previous,
                    end: periods[index + 1].end,
                });
            }
            else {
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
        if (last &&
            last.isSleep === current.isSleep &&
            current.start.getTime() - last.end.getTime() <= gapBreakMs) {
            const updated = merged.pop();
            merged.push({ ...updated, end: current.end });
        }
        else {
            merged.push({ ...current });
        }
        index += 1;
    }
    return merged;
}
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
function groupSleepsByNight(sleepPeriods, records, intervalSeconds) {
    const grouped = new Map();
    for (const period of sleepPeriods) {
        const day = startOfDay(period.end);
        const key = Math.floor(day.getTime() / 1000);
        const existing = grouped.get(key);
        if (existing) {
            existing.push(period);
        }
        else {
            grouped.set(key, [period]);
        }
    }
    const results = [];
    for (const [, periods] of grouped) {
        const sorted = [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());
        if (sorted.length === 0)
            continue;
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSleep = sorted.reduce((sum, p) => sum + (p.end.getTime() - p.start.getTime()), 0);
        const durationHours = totalSleep / (3600 * 1000);
        const interruptionCount = Math.max(0, sorted.length - 1);
        const envelope = Math.max(1, last.end.getTime() - first.start.getTime());
        const interruptionMinutes = Math.max(0, (envelope - totalSleep) / (60 * 1000));
        const continuity = (0, utils_1.clamp)(1 - interruptionMinutes / 120, 0, 1);
        const validCoverage = estimateCoverage(records, first.start, last.end, intervalSeconds);
        results.push({
            nightDate: startOfDay(last.end),
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
function estimateCoverage(records, start, end, intervalSeconds) {
    if (end.getTime() <= start.getTime())
        return 0;
    const observed = records.filter((r) => r.timestamp.getTime() >= start.getTime() &&
        r.timestamp.getTime() <= end.getTime()).length;
    const spanSeconds = (end.getTime() - start.getTime()) / 1000;
    const expected = Math.max(1, Math.round(spanSeconds / Math.max(intervalSeconds, 1)));
    return Math.min(1, observed / Math.max(1, expected));
}
function regularityScore(index, groups) {
    const start = Math.max(0, index - 6);
    const recent = groups.slice(start, index + 1);
    if (recent.length < 3)
        return 0.65;
    const bedMinutes = recent.map((g) => minutesOfDay(g.bedtime));
    const wakeMinutes = recent.map((g) => minutesOfDay(g.wakeTime));
    const bedStd = (0, utils_1.standardDeviation)(bedMinutes);
    const wakeStd = (0, utils_1.standardDeviation)(wakeMinutes);
    const penalty = Math.min(1.0, (bedStd + wakeStd) / 180.0);
    return Math.max(0, 1 - penalty);
}
function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes();
}
function medianIntervalSeconds(records) {
    if (records.length <= 2)
        return 60.0;
    const intervals = [];
    for (let i = 1; i < records.length; i++) {
        const diff = Math.max(1.0, (records[i].timestamp.getTime() -
            records[i - 1].timestamp.getTime()) /
            1000);
        if (diff < 300.0) {
            intervals.push(diff);
        }
    }
    if (intervals.length === 0)
        return 60.0;
    intervals.sort((a, b) => a - b);
    return intervals[Math.floor(intervals.length / 2)];
}
//# sourceMappingURL=sleep-event-engine.js.map