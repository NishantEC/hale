/**
 * Circadian core temperature estimation from skin temperature.
 *
 * Core temp ≈ skin temp + 4.0°C + circadian offset (sine model).
 * Temperature nadir typically occurs ~2h before natural wake time.
 */

export interface CoreTempResult {
  coreEstimate: number; // Average estimated core temp in °C
  nadir: Date | null; // Time of lowest temperature
}

export function estimateCoreTemperature(
  skinTempPoints: { timestamp: Date; value: number }[],
  nightMedianSkinTemp: number,
): CoreTempResult {
  if (skinTempPoints.length < 10 || nightMedianSkinTemp <= 0) {
    return { coreEstimate: NaN, nadir: null };
  }

  const SKIN_TO_CORE_OFFSET = 4.0;

  // Compute core estimates with circadian adjustment
  let minTemp = Infinity;
  let nadirTs: Date | null = null;
  let coreSum = 0;

  for (const point of skinTempPoints) {
    const hour = point.timestamp.getHours() + point.timestamp.getMinutes() / 60;

    // Circadian offset: temperature nadir around 4-5 AM (~-0.5°C),
    // peak around 6-7 PM (~+0.5°C). Model as sine with nadir at 4.5h.
    const circadianOffset = -0.5 * Math.cos((2 * Math.PI * (hour - 4.5)) / 24);

    const coreEstimate = point.value + SKIN_TO_CORE_OFFSET + circadianOffset;
    coreSum += coreEstimate;

    if (point.value < minTemp) {
      minTemp = point.value;
      nadirTs = point.timestamp;
    }
  }

  return {
    coreEstimate: Math.round((coreSum / skinTempPoints.length) * 10) / 10,
    nadir: nadirTs,
  };
}
