import { detectActivities } from './activity-detector';
import type {
  HistoricalSensorRecord,
  SleepDetectionSummary,
  BaselineProfile,
} from './interfaces';

const BASELINE: BaselineProfile = {
  restingHeartRate: 60,
  rmssd: 50,
  sdnn: 60,
  nightsUsed: 5,
  isWarmedUp: true,
  maxHeartRate: 190,
};

function record(
  iso: string,
  overrides: Partial<HistoricalSensorRecord> = {},
): HistoricalSensorRecord {
  return {
    timestamp: new Date(iso),
    heartRate: 75,
    rrAverageMs: 800,
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

function movingRecordsEveryMinute(
  startIso: string,
  endIso: string,
  hr = 90,
): HistoricalSensorRecord[] {
  const rows: HistoricalSensorRecord[] = [];
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  let i = 0;
  for (let t = start; t <= end; t += 60_000) {
    const z = i % 2 === 0 ? 1.2 : 0.8;
    rows.push(
      record(new Date(t).toISOString(), {
        heartRate: hr,
        gravityZ: z,
      }),
    );
    i++;
  }
  return rows;
}

describe('detectActivities — gap handling', () => {
  it('emits an Off-Wrist entry for a long data gap with a matching WristOff event', () => {
    const records = [
      ...movingRecordsEveryMinute('2026-05-15T00:30:00.000Z', '2026-05-15T01:10:00.000Z'),
      ...movingRecordsEveryMinute('2026-05-15T11:30:00.000Z', '2026-05-15T11:55:00.000Z'),
    ];
    const bouts = detectActivities(records, [], BASELINE, [
      {
        start: new Date('2026-05-15T01:11:00.000Z'),
        end: new Date('2026-05-15T11:29:00.000Z'),
        source: 'WristOff',
      },
    ]);
    const offWrist = bouts.filter((b) => b.activityType === 'Off-Wrist');
    expect(offWrist).toHaveLength(1);
    expect(offWrist[0].durationMinutes).toBeGreaterThan(60);
    expect(offWrist[0].externalSource).toBe('event:WristOff');
  });

  it('labels a long data gap without a matching event as "No Data"', () => {
    const records = [
      ...movingRecordsEveryMinute('2026-05-15T01:00:00.000Z', '2026-05-15T01:40:00.000Z'),
      ...movingRecordsEveryMinute('2026-05-15T03:00:00.000Z', '2026-05-15T03:25:00.000Z'),
    ];
    const bouts = detectActivities(records, [], BASELINE, []);
    const noData = bouts.filter((b) => b.activityType === 'No Data');
    expect(noData).toHaveLength(1);
    expect(noData[0].durationMinutes).toBeGreaterThan(60);
  });

  it('does not produce a multi-hour bout that spans a BLE/data gap', () => {
    // 40 minutes of movement, then a 10-hour gap (no records), then 25 more
    // minutes of movement. Pre-fix: one bout from start to end (10h+
    // duration, classified Sedentary). Post-fix: two short bouts on either
    // side of the gap.
    const records = [
      ...movingRecordsEveryMinute('2026-05-15T00:30:00.000Z', '2026-05-15T01:10:00.000Z'),
      ...movingRecordsEveryMinute('2026-05-15T11:30:00.000Z', '2026-05-15T11:55:00.000Z'),
    ];
    const sleeps: SleepDetectionSummary[] = [];
    const bouts = detectActivities(records, sleeps, BASELINE);
    for (const b of bouts) {
      // No regular activity bout may span the gap. The Off-Wrist gap
      // entry itself spans the gap — exclude it from this assertion.
      if (b.activityType === 'Off-Wrist' || b.activityType === 'No Data') continue;
      expect(b.durationMinutes).toBeLessThanOrEqual(60);
    }
    // No movement bout should both start before and end after the gap.
    const gapStartMs = new Date('2026-05-15T01:10:00.000Z').getTime();
    const gapEndMs = new Date('2026-05-15T11:30:00.000Z').getTime();
    for (const b of bouts) {
      if (b.activityType === 'Off-Wrist' || b.activityType === 'No Data') continue;
      const startsBeforeGap = b.startTime.getTime() <= gapStartMs;
      const endsAfterGap = b.endTime.getTime() >= gapEndMs;
      expect(startsBeforeGap && endsAfterGap).toBe(false);
    }
  });
});
