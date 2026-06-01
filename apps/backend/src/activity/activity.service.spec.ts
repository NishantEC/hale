import type { Repository } from 'typeorm';
import { ActivityService } from './activity.service';
import type { ActivityDetection } from './entities/activity-detection.entity';
import type { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity';
import type { BaselineProfile } from '../plans/baseline-profile.entity';

type HrRow = { hr: string; t: Date; g: string | null };

function makeService(opts: {
  bout: Partial<ActivityDetection> | null;
  hrRows?: HrRow[];
  baseline?: Partial<BaselineProfile> | null;
}): ActivityService {
  const activityRepo = {
    findOne: jest.fn().mockResolvedValue(opts.bout),
  };
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(opts.hrRows ?? []),
  };
  const rawSensorRepo = {
    createQueryBuilder: jest.fn(() => qb),
  };
  const baselineRepo = {
    findOne: jest.fn().mockResolvedValue(opts.baseline ?? null),
  };
  // Mock boundary: jest doubles can't satisfy the full TypeORM Repository<T>
  // surface, so cast through unknown. Only the members getBoutDetail touches
  // are implemented.
  return new ActivityService(
    activityRepo as unknown as Repository<ActivityDetection>,
    rawSensorRepo as unknown as Repository<RawSensorRecord>,
    baselineRepo as unknown as Repository<BaselineProfile>,
  );
}

function bout(overrides: Partial<ActivityDetection> = {}): Partial<ActivityDetection> {
  return {
    id: 'bout-1',
    userId: 'user-1',
    startTime: new Date('2026-05-12T18:00:00.000Z'),
    endTime: new Date('2026-05-12T18:30:00.000Z'),
    durationMinutes: 30,
    activityType: 'Run',
    intensity: 'hard',
    confidence: 0.9,
    heartRateAvg: 150,
    heartRateMax: 190,
    strainScore: 12.34,
    source: 'detected',
    userConfirmedType: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe('ActivityService.getBoutDetail', () => {
  it('returns null when the bout does not belong to the user', async () => {
    const service = makeService({ bout: null });
    expect(await service.getBoutDetail('user-1', 'missing')).toBeNull();
  });

  it('integrates HR-zone minutes by time, not by sample count', async () => {
    // maxHR 200, so %HRmax zone edges land at 120/140/160/180 bpm.
    // Four samples one minute apart: each owns the 60s gap to the next; the
    // final sample owns a nominal 1s.
    const t0 = new Date('2026-05-12T18:00:00.000Z').getTime();
    const hrRows: HrRow[] = [
      { hr: '100', t: new Date(t0), g: null }, // Z1
      { hr: '130', t: new Date(t0 + 60_000), g: null }, // Z2
      { hr: '150', t: new Date(t0 + 120_000), g: null }, // Z3
      { hr: '190', t: new Date(t0 + 180_000), g: null }, // Z5
    ];
    const service = makeService({
      bout: bout(),
      hrRows,
      baseline: { maxHeartRate: 200, restingHeartRate: 50 },
    });

    const detail = await service.getBoutDetail('user-1', 'bout-1');
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.zoneMinutes).toEqual([1, 1, 1, 0, 0]);
    expect(detail.zonePercents).toEqual([33, 33, 33, 0, 0]);
    expect(detail.hrCurve).toHaveLength(4);
    expect(detail.hrCurve[0]).toEqual({ t: t0, hr: 100 });
    expect(detail.heartRateMax).toBe(190);
    expect(detail.intensity).toBe('hard');
  });

  it('marks an unconfirmed detected bout as a candidate', async () => {
    const service = makeService({ bout: bout(), baseline: { maxHeartRate: 200 } });
    const detail = await service.getBoutDetail('user-1', 'bout-1');
    expect(detail?.source).toBe('candidate');
  });

  it('maps a confirmed bout back to detected and a user-logged bout to manual', async () => {
    const confirmed = makeService({
      bout: bout({ userConfirmedType: 'Run', source: 'user_confirmed' }),
    });
    expect((await confirmed.getBoutDetail('user-1', 'bout-1'))?.source).toBe('detected');

    const logged = makeService({
      bout: bout({ source: 'user_logged', userConfirmedType: null }),
    });
    expect((await logged.getBoutDetail('user-1', 'bout-1'))?.source).toBe('manual');
  });

  it('returns empty curve and zeroed zones when no HR samples exist', async () => {
    const service = makeService({ bout: bout(), hrRows: [] });
    const detail = await service.getBoutDetail('user-1', 'bout-1');
    expect(detail?.hrCurve).toEqual([]);
    expect(detail?.zoneMinutes).toEqual([0, 0, 0, 0, 0]);
    expect(detail?.zonePercents).toEqual([0, 0, 0, 0, 0]);
    expect(detail?.motionIntensity).toBeUndefined();
  });
});
