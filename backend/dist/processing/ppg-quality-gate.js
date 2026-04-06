"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitize = sanitize;
exports.confidenceLevel = confidenceLevel;
function sanitize(samples) {
    return samples.filter(sample => {
        if (sample.heartRate < 35 || sample.heartRate > 210)
            return false;
        if (sample.ibiMs !== null && (sample.ibiMs < 250 || sample.ibiMs > 2000))
            return false;
        if (sample.motionScore !== null && sample.motionScore > 0.65)
            return false;
        const quality = Math.max(0, Math.min(1, sample.qualityScore));
        if (quality < 0.35)
            return false;
        return true;
    }).map(sample => ({
        ...sample,
        qualityScore: Math.max(0, Math.min(1, sample.qualityScore)),
    }));
}
function confidenceLevel(rawValue) {
    if (rawValue >= 0.75)
        return 'High';
    if (rawValue >= 0.45)
        return 'Medium';
    return 'Low';
}
//# sourceMappingURL=ppg-quality-gate.js.map