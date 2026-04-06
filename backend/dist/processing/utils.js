"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.median = median;
exports.percentile = percentile;
exports.average = average;
exports.standardDeviation = standardDeviation;
exports.coefficientOfVariation = coefficientOfVariation;
exports.clamp = clamp;
exports.dayKey = dayKey;
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
    return sorted[index];
}
function average(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
function standardDeviation(values) {
    if (values.length < 2)
        return 0;
    const avg = average(values);
    const squaredDiffs = values.map(v => (v - avg) ** 2);
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}
function coefficientOfVariation(values) {
    const avg = average(values);
    if (avg === 0)
        return 0;
    return standardDeviation(values) / Math.abs(avg);
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function dayKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}
//# sourceMappingURL=utils.js.map