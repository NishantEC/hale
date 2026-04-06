"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNightFeatureSet = buildNightFeatureSet;
exports.applyingSleepDurationFallback = applyingSleepDurationFallback;
exports.effectiveSleepFeatureSet = effectiveSleepFeatureSet;
exports.recomputeBaselineProfile = recomputeBaselineProfile;
exports.computeDailyScore = computeDailyScore;
const utils_1 = require("./utils");
const ppg_quality_gate_1 = require("./ppg-quality-gate");
function buildNightFeatureSet(samples, referenceDate, baseline, options = {}) {
    const windowStart = options.bedtime ?? new Date(referenceDate.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = options.wakeTime ?? referenceDate;
    const nightSamples = samples.filter(s => s.timestamp >= windowStart && s.timestamp <= windowEnd);
    const expectedSamples = estimateExpectedSamples(nightSamples, windowStart, windowEnd);
    const detectedCoverage = expectedSamples <= 0 ? 0 : Math.min(1.0, nightSamples.length / expectedSamples);
    const validCoverage = (0, utils_1.clamp)(options.validCoverage ?? detectedCoverage, 0, 1);
    const heartRates = nightSamples.map(s => s.heartRate);
    const ibis = nightSamples.map(s => s.ibiMs !== null ? s.ibiMs : 60000 / s.heartRate);
    const restingHeartRate = heartRates.length > 0 ? (0, utils_1.percentile)(heartRates, 0.15) : 0;
    const rmssd = computeRMSSD(ibis);
    const sdnn = ibis.length >= 2 ? (0, utils_1.standardDeviation)(ibis) : 0;
    const hrStdDev = heartRates.length >= 2 ? (0, utils_1.standardDeviation)(heartRates) : 0;
    const respiratoryRate = (0, utils_1.clamp)(14.0 + hrStdDev * 0.65, 10, 22);
    const continuity = (0, utils_1.clamp)(options.continuity ?? estimateContinuity(nightSamples), 0, 1);
    const regularity = (0, utils_1.clamp)(options.regularity ??
        (baseline.nightsUsed === 0
            ? 0.65
            : Math.max(0, 1 - Math.abs(restingHeartRate - baseline.restingHeartRate) / 25)), 0, 1);
    const avgQuality = nightSamples.length > 0
        ? (0, utils_1.average)(nightSamples.map(s => s.qualityScore))
        : 0;
    const confidenceRaw = Math.min(1, validCoverage * 0.6 + avgQuality * 0.4);
    const observedWindowHours = Math.max(0, (windowEnd.getTime() - windowStart.getTime()) / 3_600_000);
    const sleepEstimateHours = (0, utils_1.clamp)(options.sleepEstimateHours ??
        (observedWindowHours > 0 ? observedWindowHours : validCoverage * 10.5), 2, 14);
    const sourceBlend = options.sourceBlend ?? computeSourceBlend(nightSamples);
    return {
        nightDate: referenceDate,
        restingHeartRate,
        rmssd,
        sdnn,
        respiratoryRate,
        continuity,
        regularity,
        validCoverage,
        confidenceRaw,
        sleepEstimateHours,
        sourceBlend,
    };
}
function applyingSleepDurationFallback(featureSet, durationHours) {
    const clampedDuration = (0, utils_1.clamp)(durationHours, 2, 14);
    const boostedCoverage = Math.max(featureSet.validCoverage, 0.7);
    const boostedConfidence = Math.max(featureSet.confidenceRaw, 0.65);
    return {
        ...featureSet,
        sleepEstimateHours: clampedDuration,
        validCoverage: boostedCoverage,
        confidenceRaw: boostedConfidence,
    };
}
function effectiveSleepFeatureSet(featureSet, sleepSummary) {
    if (!sleepSummary || featureSet.validCoverage < 0.35) {
        return featureSet;
    }
    const continuityDiff = Math.abs(featureSet.continuity - sleepSummary.continuity);
    const regularityDiff = Math.abs(featureSet.regularity - sleepSummary.regularity);
    let confidenceAdjustment = 0;
    if (continuityDiff < 0.15 && regularityDiff < 0.15) {
        confidenceAdjustment = 0.1;
    }
    else if (continuityDiff > 0.4 || regularityDiff > 0.4) {
        confidenceAdjustment = -0.15;
    }
    const mergedContinuity = (featureSet.continuity + sleepSummary.continuity) / 2;
    const mergedRegularity = (featureSet.regularity + sleepSummary.regularity) / 2;
    const mergedCoverage = Math.max(featureSet.validCoverage, sleepSummary.validCoverage);
    const mergedConfidence = (0, utils_1.clamp)(featureSet.confidenceRaw + confidenceAdjustment, 0, 1);
    const mergedSleepEstimate = sleepSummary.durationHours > 0
        ? sleepSummary.durationHours
        : featureSet.sleepEstimateHours;
    return {
        ...featureSet,
        continuity: mergedContinuity,
        regularity: mergedRegularity,
        validCoverage: mergedCoverage,
        confidenceRaw: mergedConfidence,
        sleepEstimateHours: mergedSleepEstimate,
    };
}
function recomputeBaselineProfile(features) {
    const valid = features.filter(feature => feature.validCoverage >= 0.35 &&
        feature.restingHeartRate > 0 &&
        feature.rmssd >= 0 &&
        feature.sdnn >= 0);
    if (valid.length === 0) {
        return {
            restingHeartRate: 0,
            rmssd: 0,
            sdnn: 0,
            nightsUsed: 0,
            isWarmedUp: false,
        };
    }
    return {
        restingHeartRate: (0, utils_1.average)(valid.map(feature => feature.restingHeartRate)),
        rmssd: (0, utils_1.average)(valid.map(feature => feature.rmssd)),
        sdnn: (0, utils_1.average)(valid.map(feature => feature.sdnn)),
        nightsUsed: valid.length,
        isWarmedUp: valid.length >= 5,
    };
}
function computeDailyScore(featureSet, baseline, targetSleepMinutes) {
    const rhrPenalty = Math.max(0, featureSet.restingHeartRate - baseline.restingHeartRate) * 1.5;
    const hrvBoost = (0, utils_1.clamp)((featureSet.rmssd - baseline.rmssd) * 0.45, -18, 18);
    const continuityBoost = (featureSet.continuity - 0.5) * 35;
    const regularityBoost = (featureSet.regularity - 0.5) * 20;
    const dailyBalance = (0, utils_1.clamp)(Math.round(65 + hrvBoost + continuityBoost + regularityBoost - rhrPenalty), 0, 100);
    const loadPressure = (0, utils_1.clamp)(Math.round(35 + Math.max(0, 70 - dailyBalance) + rhrPenalty * 0.8), 0, 100);
    const sleepReserve = featureSet.sleepEstimateHours - targetSleepMinutes / 60;
    let recommendation;
    if (dailyBalance < 42 || sleepReserve < -1.1) {
        recommendation = 'Restore';
    }
    else if (dailyBalance > 72 && loadPressure < 58) {
        recommendation = 'Build';
    }
    else {
        recommendation = 'Steady';
    }
    const confidence = (0, ppg_quality_gate_1.confidenceLevel)(featureSet.confidenceRaw);
    const detail = `Balance ${dailyBalance}, Load ${loadPressure}, Sleep reserve ${sleepReserve.toFixed(1)}h`;
    return {
        dayDate: featureSet.nightDate,
        dailyBalance,
        loadPressure,
        sleepReserveHours: sleepReserve,
        confidence,
        recommendation,
        detail,
    };
}
function computeRMSSD(ibis) {
    if (ibis.length < 2)
        return 0;
    let sumSquaredDiffs = 0;
    for (let i = 1; i < ibis.length; i++) {
        const diff = ibis[i] - ibis[i - 1];
        sumSquaredDiffs += diff * diff;
    }
    return Math.sqrt(sumSquaredDiffs / (ibis.length - 1));
}
function estimateContinuity(samples) {
    if (samples.length < 2)
        return 0.5;
    const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let gapCount = 0;
    for (let i = 1; i < sorted.length; i++) {
        const gapMinutes = (sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime()) /
            60000;
        if (gapMinutes > 8) {
            gapCount++;
        }
    }
    const totalSamples = sorted.length;
    return (0, utils_1.clamp)(1 - gapCount / Math.max(1, totalSamples / 8), 0, 1);
}
function estimateExpectedSamples(samples, windowStart, windowEnd) {
    const windowSeconds = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / 1000);
    if (samples.length < 2) {
        return Math.max(1, Math.round(windowSeconds / 60));
    }
    const intervals = [];
    for (let index = 1; index < samples.length; index++) {
        const deltaSeconds = (samples[index].timestamp.getTime() -
            samples[index - 1].timestamp.getTime()) /
            1000;
        if (deltaSeconds > 0 && deltaSeconds <= 300) {
            intervals.push(deltaSeconds);
        }
    }
    const sampleIntervalSeconds = intervals.length > 0
        ? intervals.sort((left, right) => left - right)[Math.floor(intervals.length / 2)]
        : 60;
    return Math.max(1, Math.round(windowSeconds / sampleIntervalSeconds));
}
function computeSourceBlend(samples) {
    if (samples.length === 0)
        return 'none';
    let strapCount = 0;
    let healthkitCount = 0;
    for (const s of samples) {
        if (s.source.toLowerCase().includes('strap')) {
            strapCount++;
        }
        else {
            healthkitCount++;
        }
    }
    if (strapCount > 0 && healthkitCount > 0) {
        return `strap:${strapCount},healthkit:${healthkitCount}`;
    }
    else if (strapCount > 0) {
        return `strap:${strapCount}`;
    }
    else {
        return `healthkit:${healthkitCount}`;
    }
}
//# sourceMappingURL=wellness-scoring.js.map