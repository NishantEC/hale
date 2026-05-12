import { SleepEventEngine } from './sleep-event-engine';
import type { HistoricalSensorRecord } from './interfaces';

function record(timestamp: string, heartRate = 62): HistoricalSensorRecord {
  return {
    timestamp: new Date(timestamp),
    heartRate,
    rrAverageMs: 60_000 / heartRate,
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
  };
}

function recordsEveryMinute(
  startIso: string,
  endIso: string,
): HistoricalSensorRecord[] {
  const rows: HistoricalSensorRecord[] = [];
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  for (let time = start; time <= end; time += 60_000) {
    rows.push(record(new Date(time).toISOString()));
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
});
