"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeTypicalRanges = computeTypicalRanges;
const utils_1 = require("./utils");
function computeTypicalRanges(detections, stages, excludeDate) {
    const excludeKey = (0, utils_1.dayKey)(excludeDate);
    const validDetections = detections.filter((d) => (0, utils_1.dayKey)(d.nightDate) !== excludeKey && d.confidence > 0.5);
    const validStages = stages.filter((s) => {
        const total = s.remMinutes +
            s.coreMinutes +
            s.deepMinutes +
            s.awakeMinutes +
            s.unknownMinutes;
        return ((0, utils_1.dayKey)(s.nightDate) !== excludeKey && s.confidence > 0.5 && total > 0);
    });
    if (validDetections.length < 3 || validStages.length < 3)
        return null;
    const durations = validDetections.map((d) => d.durationHours * 60);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const restoratives = validStages.map((s) => s.deepMinutes + s.remMinutes);
    const avgRestorative = restoratives.reduce((a, b) => a + b, 0) / restoratives.length;
    function percentileRange(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const p25 = sorted[Math.max(0, Math.floor(sorted.length / 4))];
        const p75 = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * 3) / 4))];
        return { lower: p25, upper: p75 };
    }
    const awakePcts = validStages.map((s) => {
        const total = s.remMinutes +
            s.coreMinutes +
            s.deepMinutes +
            s.awakeMinutes +
            s.unknownMinutes;
        return (s.awakeMinutes / total) * 100;
    });
    const lightPcts = validStages.map((s) => {
        const total = s.remMinutes +
            s.coreMinutes +
            s.deepMinutes +
            s.awakeMinutes +
            s.unknownMinutes;
        return (s.coreMinutes / total) * 100;
    });
    const deepPcts = validStages.map((s) => {
        const total = s.remMinutes +
            s.coreMinutes +
            s.deepMinutes +
            s.awakeMinutes +
            s.unknownMinutes;
        return (s.deepMinutes / total) * 100;
    });
    const remPcts = validStages.map((s) => {
        const total = s.remMinutes +
            s.coreMinutes +
            s.deepMinutes +
            s.awakeMinutes +
            s.unknownMinutes;
        return (s.remMinutes / total) * 100;
    });
    return {
        typicalDurationMinutes: avgDuration,
        typicalRestorativeMinutes: avgRestorative,
        typicalAwakePercent: percentileRange(awakePcts),
        typicalLightPercent: percentileRange(lightPcts),
        typicalDeepPercent: percentileRange(deepPcts),
        typicalRemPercent: percentileRange(remPcts),
    };
}
//# sourceMappingURL=typical-ranges.js.map