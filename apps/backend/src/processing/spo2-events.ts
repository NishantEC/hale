/**
 * SpO2 desaturation event detection for sleep apnea screening.
 *
 * Detects events where SpO2 drops ≥3% below a rolling 2-minute baseline.
 * Reports ODI (Oxygen Desaturation Index) = events per hour.
 */

export interface SpO2DipEvent {
  timestamp: Date;
  nadir: number;
  durationSeconds: number;
}

export interface DesaturationResult {
  events: SpO2DipEvent[];
  odiPerHour: number;
  lowestSpo2: number;
}

const BASELINE_WINDOW_SECONDS = 120;
const DIP_THRESHOLD_PERCENT = 3;
const MIN_DIP_SECONDS = 10;
const MIN_POINTS = 30;

export function detectDesaturationEvents(
  spo2Points: { timestamp: Date; value: number }[],
  sleepWindow?: { start: Date; end: Date } | null,
): DesaturationResult {
  if (spo2Points.length < MIN_POINTS) {
    return { events: [], odiPerHour: 0, lowestSpo2: 100 };
  }

  const sorted = [...spo2Points].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  // If sleep window provided, filter to sleep-only data for clinical ODI
  let filtered = sorted;
  if (sleepWindow) {
    filtered = sorted.filter(
      (p) => p.timestamp.getTime() >= sleepWindow.start.getTime() &&
             p.timestamp.getTime() <= sleepWindow.end.getTime(),
    );
    if (filtered.length < MIN_POINTS) {
      return { events: [], odiPerHour: 0, lowestSpo2: 100 };
    }
  }

  const totalHours =
    (filtered[filtered.length - 1].timestamp.getTime() - filtered[0].timestamp.getTime()) /
    3600000;
  if (totalHours <= 0) return { events: [], odiPerHour: 0, lowestSpo2: 100 };

  let lowestSpo2 = 100;
  const events: SpO2DipEvent[] = [];
  let inDip = false;
  let dipStart: Date | null = null;
  let dipNadir = 100;

  for (let i = 0; i < filtered.length; i++) {
    const current = filtered[i];
    lowestSpo2 = Math.min(lowestSpo2, current.value);

    // Compute rolling baseline from the previous 2-minute window
    const windowStart = current.timestamp.getTime() - BASELINE_WINDOW_SECONDS * 1000;
    const windowPoints = filtered.filter(
      (p) =>
        p.timestamp.getTime() >= windowStart &&
        p.timestamp.getTime() < current.timestamp.getTime(),
    );

    if (windowPoints.length < 3) continue;
    const baseline =
      windowPoints.reduce((s, p) => s + p.value, 0) / windowPoints.length;

    const drop = baseline - current.value;

    if (drop >= DIP_THRESHOLD_PERCENT) {
      if (!inDip) {
        inDip = true;
        dipStart = current.timestamp;
        dipNadir = current.value;
      } else {
        dipNadir = Math.min(dipNadir, current.value);
      }
    } else if (inDip && dipStart) {
      const durationSeconds =
        (current.timestamp.getTime() - dipStart.getTime()) / 1000;
      if (durationSeconds >= MIN_DIP_SECONDS) {
        events.push({
          timestamp: dipStart,
          nadir: dipNadir,
          durationSeconds,
        });
      }
      inDip = false;
      dipStart = null;
      dipNadir = 100;
    }
  }

  // Close any open dip
  if (inDip && dipStart) {
    const lastTs = filtered[filtered.length - 1].timestamp;
    const durationSeconds =
      (lastTs.getTime() - dipStart.getTime()) / 1000;
    if (durationSeconds >= MIN_DIP_SECONDS) {
      events.push({ timestamp: dipStart, nadir: dipNadir, durationSeconds });
    }
  }

  return {
    events,
    odiPerHour: events.length / totalHours,
    lowestSpo2,
  };
}
