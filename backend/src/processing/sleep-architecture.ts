/**
 * Sleep architecture quality scoring.
 *
 * Evaluates the structure of sleep cycles: NREM→REM cycling,
 * deep sleep front-loading, REM progression, and stage proportions.
 */

import type { SleepStageEpoch } from './interfaces';

export interface ArchitectureResult {
  architectureScore: number; // 0-100
  cycleCount: number;
  deepFrontLoaded: boolean;
  remProgression: boolean;
}

const CYCLE_MIN_MINUTES = 60;
const CYCLE_MAX_MINUTES = 120;

export function computeSleepArchitectureQuality(
  epochs: SleepStageEpoch[],
  durationHours: number,
): ArchitectureResult {
  if (epochs.length < 30 || durationHours < 1) {
    return { architectureScore: 0, cycleCount: 0, deepFrontLoaded: false, remProgression: false };
  }

  const stages = epochs.map((e) => normalizeStage(e.stage));
  const totalMinutes = epochs.length; // Assuming 1-minute epochs

  // 1. Detect NREM→REM cycles
  const cycles = detectCycles(stages);
  const expectedCycles = Math.floor(durationHours / 1.5);
  const cycleScore = expectedCycles > 0
    ? Math.min(1, cycles.length / expectedCycles) * 25
    : cycles.length > 0 ? 15 : 0;

  // 2. Deep sleep front-loading (first half should have more deep)
  const halfIdx = Math.floor(stages.length / 2);
  const deepFirstHalf = stages.slice(0, halfIdx).filter((s) => s === 'deep').length;
  const deepSecondHalf = stages.slice(halfIdx).filter((s) => s === 'deep').length;
  const deepFrontLoaded = deepFirstHalf > deepSecondHalf;
  const deepDistScore = deepFrontLoaded ? 25 : (deepFirstHalf > 0 ? 15 : 5);

  // 3. REM progression (second half should have more REM)
  const remFirstHalf = stages.slice(0, halfIdx).filter((s) => s === 'rem').length;
  const remSecondHalf = stages.slice(halfIdx).filter((s) => s === 'rem').length;
  const remProgression = remSecondHalf > remFirstHalf;
  const remDistScore = remProgression ? 25 : (remSecondHalf > 0 ? 15 : 5);

  // 4. Stage proportion scoring
  const deepPercent = stages.filter((s) => s === 'deep').length / totalMinutes * 100;
  const remPercent = stages.filter((s) => s === 'rem').length / totalMinutes * 100;
  const awakePercent = stages.filter((s) => s === 'awake').length / totalMinutes * 100;

  let proportionScore = 0;
  // Deep: ideal 13-23%
  if (deepPercent >= 13 && deepPercent <= 23) proportionScore += 10;
  else if (deepPercent >= 8 && deepPercent <= 30) proportionScore += 5;
  // REM: ideal 20-25%
  if (remPercent >= 20 && remPercent <= 25) proportionScore += 10;
  else if (remPercent >= 12 && remPercent <= 35) proportionScore += 5;
  // Awake: ideal < 5%
  if (awakePercent < 5) proportionScore += 5;
  else if (awakePercent < 10) proportionScore += 2;

  const architectureScore = Math.round(
    Math.max(0, Math.min(100, cycleScore + deepDistScore + remDistScore + proportionScore)),
  );

  return {
    architectureScore,
    cycleCount: cycles.length,
    deepFrontLoaded,
    remProgression,
  };
}

function normalizeStage(stage: string): string {
  const s = stage.toLowerCase();
  if (s === 'light' || s === 'core') return 'core';
  if (s === 'sws') return 'deep';
  return s;
}

interface Cycle {
  startIdx: number;
  endIdx: number;
  hasDeepOrCore: boolean;
  hasRem: boolean;
}

function detectCycles(stages: string[]): Cycle[] {
  const cycles: Cycle[] = [];
  let cycleStart = 0;
  let hadNrem = false;
  let hadRem = false;

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s === 'deep' || s === 'core') hadNrem = true;
    if (s === 'rem') hadRem = true;

    // A cycle completes when we transition from REM back to NREM or awake
    if (hadNrem && hadRem && s !== 'rem') {
      const lengthMinutes = i - cycleStart;
      if (lengthMinutes >= CYCLE_MIN_MINUTES && lengthMinutes <= CYCLE_MAX_MINUTES) {
        cycles.push({
          startIdx: cycleStart,
          endIdx: i,
          hasDeepOrCore: hadNrem,
          hasRem: hadRem,
        });
      }
      cycleStart = i;
      hadNrem = false;
      hadRem = false;
    }
  }

  return cycles;
}
