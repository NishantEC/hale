import { SleepEventEngine, buildOffWristIntervals } from './sleep-event-engine';
import type { HistoricalSensorRecord } from './interfaces';

function record(
  timestamp: string,
  heartRate = 62,
  overrides: Partial<HistoricalSensorRecord> = {},
): HistoricalSensorRecord {
  return {
    timestamp: new Date(timestamp),
    heartRate,
    rrAverageMs: heartRate > 0 ? 60_000 / heartRate : null,
    spo2Red: 1100,
    spo2IR: 1200,
    skinTempRaw: 760,
    gravityMagnitude: null,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    respRateRaw: 14,
    skinContact: true,
    ppgGreen: null,
    ppgRedIr: null,
    ambientLight: null,
    ledDrive1: null,
    ledDrive2: null,
    signalQuality: null,
    ...overrides,
  };
}

function recordsEveryMinute(
  startIso: string,
  endIso: string,
  overrides: Partial<HistoricalSensorRecord> = {},
): HistoricalSensorRecord[] {
  const rows: HistoricalSensorRecord[] = [];
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  for (let time = start; time <= end; time += 60_000) {
    rows.push(record(new Date(time).toISOString(), 62, overrides));
  }
  return rows;
}

// Awake activity (e.g. walking around): gravity magnitude varies frame to
// frame so the stillness classifier rejects these epochs.
function activeRecordsEveryMinute(
  startIso: string,
  endIso: string,
  overrides: Partial<HistoricalSensorRecord> = {},
): HistoricalSensorRecord[] {
  const rows: HistoricalSensorRecord[] = [];
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  let i = 0;
  for (let time = start; time <= end; time += 60_000) {
    // Magnitude oscillates ±0.2 around 1.0, well above the 0.01 stillness
    // threshold so the engine treats these as movement.
    const z = i % 2 === 0 ? 1.2 : 0.8;
    rows.push(
      record(new Date(time).toISOString(), 85, {
        gravityX: 0,
        gravityY: 0,
        gravityZ: z,
        ...overrides,
      }),
    );
    i++;
  }
  return rows;
}

describe('SleepEventEngine', () => {
  it('does not classify fragmented stillness chunks separated by long gaps', () => {
    const records = [
      ...recordsEveryMinute('2026-05-11T22:55:52.000Z', '2026-05-11T23:01:52.000Z'),
      ...recordsEveryMinute('2026-05-11T23:28:28.000Z', '2026-05-12T00:19:28.000Z'),
      ...recordsEveryMinute('2026-05-12T00:46:43.000Z', '2026-05-12T01:25:03.000Z'),
    ];

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata')).toEqual([]);
  });

  it('classifies one continuous stillness period of at least 60 minutes as sleep', () => {
    const records = recordsEveryMinute(
      '2026-05-11T23:00:00.000Z',
      '2026-05-12T00:00:00.000Z',
    );

    const detections = SleepEventEngine.detect(records, 'Asia/Kolkata');

    expect(detections).toHaveLength(1);
    expect(detections[0].bedtime.toISOString()).toBe('2026-05-11T23:00:00.000Z');
    expect(detections[0].wakeTime.toISOString()).toBe('2026-05-12T00:00:00.000Z');
  });

  it('does not classify one isolated short stillness chunk as sleep', () => {
    const records = recordsEveryMinute(
      '2026-05-11T23:28:28.000Z',
      '2026-05-12T00:18:28.000Z',
    );

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata')).toEqual([]);
  });

  it('does not classify off-wrist time (skinContact=false) as sleep', () => {
    // Simulates the strap sitting on a desk (or charger) for ~6 hours:
    // gravity is perfectly still, but skinContact is false the whole time.
    // This was producing 20h+ sleep durations in production.
    const records = recordsEveryMinute(
      '2026-05-12T09:00:00.000Z',
      '2026-05-12T15:00:00.000Z',
      { skinContact: false, heartRate: 0 },
    );

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata')).toEqual([]);
  });

  it('rejects sleep classification during device-reported WristOff window even with HR present', () => {
    // The user puts the strap on a charger but the firmware still reads HR
    // briefly (echoes) and skinContact stays null. Without explicit gating
    // this passed our HR-fraction filter. WristOff event must override.
    const records = recordsEveryMinute(
      '2026-05-12T09:00:00.000Z',
      '2026-05-12T15:00:00.000Z',
      { skinContact: null, heartRate: 60 },
    );
    const offWrist = buildOffWristIntervals(
      [
        { eventNumber: 10, capturedAt: new Date('2026-05-12T08:55:00.000Z') },
        { eventNumber: 9, capturedAt: new Date('2026-05-12T15:05:00.000Z') },
      ],
      new Date('2026-05-12T16:00:00.000Z'),
    );

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata', offWrist)).toEqual([]);
  });

  it('rejects sedentary at-desk time even when worn (HR in awake range)', () => {
    // Reproduces the user's complaint: gravity still, strap on wrist,
    // HR ~85bpm, but it's evening at-desk time — not sleep. Awake-baseline
    // visible in nearby moving records must trigger the HR gate.
    const records = [
      // Awake baseline: 3h of movement at HR=85
      ...activeRecordsEveryMinute('2026-05-15T08:00:00.000Z', '2026-05-15T11:00:00.000Z'),
      // Candidate "sleep" at desk: still gravity, HR=85 (same as awake)
      ...recordsEveryMinute('2026-05-15T13:45:00.000Z', '2026-05-15T16:30:00.000Z', { heartRate: 85 }),
    ];

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata')).toEqual([]);
  });

  it('accepts a real overnight where HR drops below awake baseline', () => {
    // Daytime active at HR=85, overnight still at HR=58 — genuine sleep.
    const records = [
      ...activeRecordsEveryMinute('2026-05-15T08:00:00.000Z', '2026-05-15T11:00:00.000Z'),
      ...recordsEveryMinute('2026-05-15T22:00:00.000Z', '2026-05-16T05:00:00.000Z', { heartRate: 58 }),
    ];

    const detections = SleepEventEngine.detect(records, 'Asia/Kolkata');
    expect(detections).toHaveLength(1);
    expect(detections[0].durationHours).toBeGreaterThanOrEqual(6);
  });

  it('caps an unclosed WristOff interval at 24h so a missed WristOn does not erase days of data', () => {
    const intervals = buildOffWristIntervals(
      [{ eventNumber: 10, capturedAt: new Date('2026-05-10T11:00:00.000Z') }],
      new Date('2026-05-13T23:00:00.000Z'),
    );
    expect(intervals).toHaveLength(1);
    const durationH =
      (intervals[0].end.getTime() - intervals[0].start.getTime()) / 3_600_000;
    expect(durationH).toBeLessThanOrEqual(24);
  });

  it('treats a ChargingOn interval as off-wrist even without WristOff', () => {
    const records = recordsEveryMinute(
      '2026-05-12T09:00:00.000Z',
      '2026-05-12T15:00:00.000Z',
      { skinContact: null, heartRate: 60 },
    );
    const offWrist = buildOffWristIntervals(
      [
        { eventNumber: 7, capturedAt: new Date('2026-05-12T08:55:00.000Z') }, // ChargingOn
        { eventNumber: 8, capturedAt: new Date('2026-05-12T15:05:00.000Z') }, // ChargingOff
      ],
      new Date('2026-05-12T16:00:00.000Z'),
    );

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata', offWrist)).toEqual([]);
  });

  it('rejects off-wrist sleep even when skinContact is missing (HR=0 fallback)', () => {
    // Older mobile clients don't populate skinContact at all. Strap is
    // sitting still on the desk: gravity steady, HR=0, skinContact=null.
    // Must still be rejected — otherwise we get the 20h+ production bug.
    const records = recordsEveryMinute(
      '2026-05-12T09:00:00.000Z',
      '2026-05-12T17:00:00.000Z',
      { skinContact: null, heartRate: 0 },
    );

    expect(SleepEventEngine.detect(records, 'Asia/Kolkata')).toEqual([]);
  });

  it('does not merge a real night with a daytime sedentary block (same calendar day, HR present)', () => {
    // Reproduces the production bug exactly:
    // bedtime ~01:00 IST (19:30 UTC), wake ~06:30 IST (01:00 UTC),
    // then strap is worn sitting at a desk 13:45 UTC → 16:30 UTC (with HR).
    // Both periods end on May 15 IST. Old engine produced a 20h envelope.
    const records = [
      ...recordsEveryMinute('2026-05-14T19:30:00.000Z', '2026-05-15T01:00:00.000Z'),
      ...recordsEveryMinute('2026-05-15T13:45:00.000Z', '2026-05-15T16:30:00.000Z'),
    ];

    const detections = SleepEventEngine.detect(records, 'Asia/Kolkata');
    expect(detections).toHaveLength(1);
    // Real sleep is the longer cluster (≈5.5h); envelope must not balloon.
    const envelopeHours =
      (detections[0].wakeTime.getTime() - detections[0].bedtime.getTime()) /
      3_600_000;
    expect(envelopeHours).toBeLessThanOrEqual(6.5);
    expect(detections[0].durationHours).toBeLessThanOrEqual(6.5);
  });

  it('does not merge a real night with a long off-wrist daytime window', () => {
    // Real night (on-wrist, HR present) ends 06:00; strap charged on desk
    // from 09:00–15:00 (off-wrist). Without skinContact gating, the engine
    // would sum both into a single ~13h sleep ending the same calendar day.
    const records = [
      ...recordsEveryMinute('2026-05-11T23:00:00.000Z', '2026-05-12T06:00:00.000Z'),
      ...recordsEveryMinute(
        '2026-05-12T09:00:00.000Z',
        '2026-05-12T15:00:00.000Z',
        { skinContact: false, heartRate: 0 },
      ),
    ];

    const detections = SleepEventEngine.detect(records, 'Asia/Kolkata');
    expect(detections).toHaveLength(1);
    // Allow boundary slack from windowed classifier; sleep must be ≤7.5h.
    expect(detections[0].durationHours).toBeLessThanOrEqual(7.5);
    expect(detections[0].durationHours).toBeGreaterThanOrEqual(6);
  });
});
