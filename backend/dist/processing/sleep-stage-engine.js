"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepStageEngine = void 0;
const utils_1 = require("./utils");
class SleepStageEngine {
    static detect(records, detections = []) {
        const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        if (sorted.length < 20)
            return [];
        const medianInterval = medianIntervalSeconds(sorted);
        const epochMinutes = Math.max(1, Math.round(medianInterval / 60));
        const epochs = [];
        for (let index = 0; index < sorted.length; index++) {
            const record = sorted[index];
            const previous = index > 0 ? sorted[index - 1] : null;
            let motionDelta;
            const currentMag = gravityMagnitude(record);
            const previousMag = previous != null ? gravityMagnitude(previous) : null;
            if (currentMag != null && previousMag != null) {
                motionDelta = Math.abs(currentMag - previousMag);
            }
            else {
                motionDelta = Number.POSITIVE_INFINITY;
            }
            let hasGap = false;
            if (previous != null) {
                hasGap =
                    record.timestamp.getTime() - previous.timestamp.getTime() >
                        5 * 60 * 1000;
            }
            const nightDate = lookupDetectionNightDate(record.timestamp, detections) ??
                startOfDay(record.timestamp);
            epochs.push({
                timestamp: record.timestamp,
                nightDate,
                heartRate: record.heartRate,
                rrMs: record.rrAverageMs,
                motionDelta,
                respiratory: record.respRateRaw,
                skinContact: record.skinContact,
                hasGap,
            });
        }
        const grouped = groupEpochsByNight(epochs, detections);
        const summaries = [];
        for (const [, items] of grouped) {
            const ordered = [...items].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            if (ordered.length < 30)
                continue;
            const validEpochs = ordered.filter((e) => e.skinContact !== false && isFinite(e.motionDelta));
            const totalMinutes = ordered.length * epochMinutes;
            if (validEpochs.length === 0) {
                summaries.push({
                    nightDate: ordered[0].nightDate,
                    remMinutes: 0,
                    coreMinutes: 0,
                    deepMinutes: 0,
                    awakeMinutes: 0,
                    unknownMinutes: totalMinutes,
                    confidence: 0,
                    source: 'Strap',
                    epochTimeline: [],
                    epochMinutes,
                });
                continue;
            }
            const hrBaseline = (0, utils_1.median)(validEpochs.map((e) => e.heartRate));
            const rrValues = validEpochs
                .map((e) => e.rrMs)
                .filter((v) => v != null);
            const rrBaseline = rrValues.length > 0 ? (0, utils_1.median)(rrValues) : null;
            const respValues = validEpochs
                .map((e) => e.respiratory)
                .filter((v) => v != null);
            const respBaseline = respValues.length > 0 ? (0, utils_1.median)(respValues) : null;
            let stages = ordered.map((epoch) => {
                if (epoch.skinContact === false ||
                    epoch.hasGap ||
                    epoch.motionDelta > 0.03) {
                    return 'awake';
                }
                const hrDelta = (epoch.heartRate - hrBaseline) / Math.max(hrBaseline, 1);
                let rrJitter = 0;
                if (rrBaseline != null && epoch.rrMs != null) {
                    rrJitter =
                        Math.abs(epoch.rrMs - rrBaseline) /
                            Math.max(rrBaseline, 1);
                }
                let respVariance = 0;
                if (respBaseline != null && epoch.respiratory != null) {
                    respVariance =
                        Math.abs(epoch.respiratory - respBaseline) /
                            Math.max(respBaseline, 1);
                }
                if (epoch.motionDelta < 0.004 &&
                    hrDelta < -0.05 &&
                    rrJitter < 0.05) {
                    return 'deep';
                }
                if (epoch.motionDelta < 0.012 &&
                    hrDelta > 0.03 &&
                    (rrJitter > 0.08 || respVariance > 0.08)) {
                    return 'rem';
                }
                return 'core';
            });
            stages = smoothShortRuns(stages, 2);
            stages = smoothImpulseTransitions(stages);
            const transitions = stages
                .slice(1)
                .filter((s, i) => s !== stages[i]).length;
            const gapCount = ordered.filter((e) => e.hasGap).length;
            const featureCompleteness = validEpochs.length / Math.max(1, ordered.length);
            const continuity = Math.max(0, 1 - gapCount / Math.max(1, Math.floor(ordered.length / 8)));
            const transitionScore = Math.max(0, 1 -
                transitions /
                    Math.max(1, Math.floor(ordered.length / 3)));
            const confidence = (0, utils_1.clamp)(featureCompleteness * 0.45 +
                continuity * 0.3 +
                transitionScore * 0.25, 0, 1);
            if (confidence < 0.5) {
                const unknownTimeline = ordered.map((e) => ({
                    timestamp: e.timestamp,
                    stage: 'unknown',
                }));
                summaries.push({
                    nightDate: ordered[0].nightDate,
                    remMinutes: 0,
                    coreMinutes: 0,
                    deepMinutes: 0,
                    awakeMinutes: 0,
                    unknownMinutes: totalMinutes,
                    confidence,
                    source: 'Strap',
                    epochTimeline: unknownTimeline,
                    epochMinutes,
                });
                continue;
            }
            const remMinutes = stages.filter((s) => s === 'rem').length * epochMinutes;
            const coreMinutes = stages.filter((s) => s === 'core').length * epochMinutes;
            const deepMinutes = stages.filter((s) => s === 'deep').length * epochMinutes;
            const awakeMinutes = stages.filter((s) => s === 'awake').length * epochMinutes;
            const timeline = ordered.map((epoch, i) => ({
                timestamp: epoch.timestamp,
                stage: stages[i],
            }));
            summaries.push({
                nightDate: ordered[0].nightDate,
                remMinutes,
                coreMinutes,
                deepMinutes,
                awakeMinutes,
                unknownMinutes: 0,
                confidence,
                source: 'Strap',
                epochTimeline: timeline,
                epochMinutes,
            });
        }
        return summaries.sort((a, b) => a.nightDate.getTime() - b.nightDate.getTime());
    }
}
exports.SleepStageEngine = SleepStageEngine;
function lookupDetectionNightDate(timestamp, detections) {
    const match = detections.find(detection => timestamp.getTime() >= detection.bedtime.getTime() &&
        timestamp.getTime() <= detection.wakeTime.getTime());
    return match?.nightDate ?? null;
}
function groupEpochsByNight(epochs, detections) {
    const grouped = new Map();
    if (detections.length > 0) {
        for (const detection of detections) {
            const items = epochs.filter(epoch => epoch.timestamp.getTime() >= detection.bedtime.getTime() &&
                epoch.timestamp.getTime() <= detection.wakeTime.getTime());
            if (items.length > 0) {
                grouped.set(detection.nightDate.getTime(), items);
            }
        }
        return grouped;
    }
    for (const epoch of epochs) {
        const key = epoch.nightDate.getTime();
        const existing = grouped.get(key);
        if (existing) {
            existing.push(epoch);
        }
        else {
            grouped.set(key, [epoch]);
        }
    }
    return grouped;
}
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
function smoothShortRuns(stages, minimumRunLength) {
    if (stages.length < 3)
        return [...stages];
    const output = [...stages];
    let index = 0;
    while (index < output.length) {
        const current = output[index];
        let end = index + 1;
        while (end < output.length && output[end] === current) {
            end++;
        }
        const runLength = end - index;
        if (runLength < minimumRunLength) {
            const left = index > 0 ? output[index - 1] : null;
            const right = end < output.length ? output[end] : null;
            const replacement = (left === right ? left : left ?? right) ?? 'core';
            for (let pos = index; pos < end; pos++) {
                output[pos] = replacement;
            }
        }
        index = end;
    }
    return output;
}
function smoothImpulseTransitions(stages) {
    if (stages.length < 3)
        return [...stages];
    const output = [...stages];
    for (let index = 1; index < stages.length - 1; index++) {
        const previous = output[index - 1];
        const current = output[index];
        const next = output[index + 1];
        if (previous === next && current !== previous) {
            output[index] = previous;
            continue;
        }
        const abruptDeepAwake = (previous === 'deep' && current === 'awake') ||
            (previous === 'awake' && current === 'deep');
        if (abruptDeepAwake && next === previous) {
            output[index] = 'core';
        }
    }
    return output;
}
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
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
//# sourceMappingURL=sleep-stage-engine.js.map