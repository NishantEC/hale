import { ViewsService } from './views.service';
import type { Repository } from 'typeorm';
import type { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity';

function repo(rows: any[] = [], one: any = null) {
  const qbChain: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getOne: jest.fn().mockResolvedValue(null),
  };
  return {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(one),
    createQueryBuilder: jest.fn(() => qbChain),
  } as any;
}

describe('ViewsService sleep view date selection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-12T06:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not show an adjacent previous sleep night for a selected day with no detection', async () => {
    const sleepDetections = [
      {
        id: 'sleep-2026-05-10',
        userId: 'user-1',
        nightDate: new Date('2026-05-09T18:30:00.000Z'),
        bedtime: new Date('2026-05-10T03:45:40.215Z'),
        wakeTime: new Date('2026-05-10T09:23:27.025Z'),
        durationHours: 5.277,
        interruptionCount: 1,
        continuity: 0.82,
        regularity: 0.65,
        validCoverage: 0.18,
        confidence: 0.37,
        updatedAt: new Date('2026-05-12T00:00:00.000Z'),
      },
    ];

    const service = new ViewsService(
      repo(sleepDetections),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const view = await service.getSleepView(
      'user-1',
      '2026-05-11',
      'Asia/Kolkata',
    );

    expect(view.selectedDate).toBe('2026-05-11');
    expect(view.selectedDateTitle).toBe('Yesterday');
    expect(view.emptyState.isEmpty).toBe(true);
    expect(view.header.bedtime).toBe('--');
  });

  it('returns a populated home view shape when no sleep data exists', async () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const view = await service.getHomeView('user-1', '2026-05-12', 'America/Los_Angeles');

    expect(view.selectedDate).toBe('2026-05-12');
    expect(view.cards.recommendation.title).toBe('Steady'); // fallback when no score
    expect(view.cards.stress.title).toBe('--');
    expect(view.cards.loadPressure.title).toBe('--');

    // Rings carry numericValue + sevenDayAverage for the home delta caption.
    expect(view.rings.sleep).toMatchObject({
      numericValue: null,
      sevenDayAverage: null,
    });
    expect(view.rings.recovery).toMatchObject({
      numericValue: null,
      sevenDayAverage: null,
    });
    expect(view.rings.strain).toMatchObject({
      numericValue: null,
      sevenDayAverage: null,
    });

    // Activities carries respiratoryRate for the Health-tab vitals tile.
    expect(view.activities).toHaveProperty('respiratoryRate');

    // Monitors block always present with stale defaults when no sensor data.
    expect(view.monitors.health.state).toBe('stale');
    expect(view.monitors.health.lastReadingAt).toBeNull();
    expect(view.monitors.stress.state).toBe('stale');
    expect(view.monitors.stress.score).toBeNull();
    expect(view.monitors.stress.todayStrip).toHaveLength(24);
    // Health monitor exposes the 5-vital dual-baseline contract + calibration flag.
    expect(view.monitors.health.vitals).toHaveLength(5);
    expect(view.monitors.health.baselineReady).toBe(false);
    expect(view.monitors.health.vitals.map((v) => v.key)).toEqual([
      'hrv',
      'rhr',
      'rr',
      'spo2',
      'skinTemp',
    ]);
  });

  it('builds trend summaries with week-over-week comparisons when at least 8 nights exist', async () => {
    const baseDate = new Date('2026-04-12T00:00:00.000Z').getTime();
    const nightFeatures = Array.from({ length: 10 }, (_, i) => ({
      id: `nf-${i}`,
      userId: 'user-1',
      nightDate: new Date(baseDate + i * 86_400_000),
      restingHeartRate: 60 - i, // declining (improving for resting HR)
      rmssd: 40 + i, // increasing (improving for HRV)
      sdnn: 35,
      pnn50: 12,
      respiratoryRate: 14,
      continuity: 1,
      regularity: 0.9,
      validCoverage: 1,
      confidenceRaw: 1,
      sleepEstimateHours: 7.5,
      sourceBlend: 'strap-history',
    }));

    const service = new ViewsService(
      repo([]),
      repo([]),
      repo(nightFeatures),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const view = await service.getTrendsView('user-1', 30);

    expect(view.summaries.hrv.current).toBe(49);
    expect(view.summaries.hrv.weekAgo).toBe(42);
    expect(view.summaries.hrv.trend).toBe('improving');
    expect(view.summaries.restingHr.trend).toBe('improving');
  });

  it('returns null trend summaries when fewer than 8 nights exist', async () => {
    const baseDate = new Date('2026-05-05T00:00:00.000Z').getTime();
    const nightFeatures = Array.from({ length: 5 }, (_, i) => ({
      id: `nf-${i}`,
      userId: 'user-1',
      nightDate: new Date(baseDate + i * 86_400_000),
      restingHeartRate: 60,
      rmssd: 40,
      sdnn: 35,
      pnn50: 12,
      respiratoryRate: 14,
      continuity: 1,
      regularity: 0.9,
      validCoverage: 1,
      confidenceRaw: 1,
      sleepEstimateHours: 7.5,
      sourceBlend: 'strap-history',
    }));

    const service = new ViewsService(
      repo([]),
      repo([]),
      repo(nightFeatures),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const view = await service.getTrendsView('user-1', 30);

    expect(view.summaries.hrv.weekAgo).toBeNull();
    expect(view.summaries.hrv.trend).toBeNull();
  });

  it('formatHrvCv returns "--" when window has fewer than 4 valid nights', () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const selected = {
      nightDate: new Date('2026-05-12T00:00:00.000Z'),
      rmssd: 45,
      validCoverage: 1,
    } as any;
    const sparseWindow = [
      selected,
      { ...selected, nightDate: new Date('2026-05-11T00:00:00.000Z') },
      { ...selected, nightDate: new Date('2026-05-10T00:00:00.000Z') },
    ];

    expect((service as any).formatHrvCv(selected, sparseWindow)).toBe('--');
  });

  it('formatHrvCv excludes low-coverage and zero-rmssd nights from the CV window', () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const selected = {
      nightDate: new Date('2026-05-12T00:00:00.000Z'),
      rmssd: 50,
      validCoverage: 1,
    } as any;
    const window = [
      selected,
      { nightDate: new Date('2026-05-11T00:00:00.000Z'), rmssd: 48, validCoverage: 1 },
      { nightDate: new Date('2026-05-10T00:00:00.000Z'), rmssd: 52, validCoverage: 1 },
      { nightDate: new Date('2026-05-09T00:00:00.000Z'), rmssd: 0, validCoverage: 1 }, // excluded
      { nightDate: new Date('2026-05-08T00:00:00.000Z'), rmssd: 60, validCoverage: 0.1 }, // excluded
    ];

    // Only selected, -11, -10 qualify — fewer than 4 → '--'.
    expect((service as any).formatHrvCv(selected, window)).toBe('--');
  });

  it('returns "--" formatHrvCv when no feature is selected', () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    expect((service as any).formatHrvCv(null, [])).toBe('--');
  });

  it('formats sleep header times in the requested timezone', async () => {
    const sleepDetections = [
      {
        id: 'sleep-2026-05-12',
        userId: 'user-1',
        nightDate: new Date('2026-05-11T11:15:00.000Z'),
        bedtime: new Date('2026-05-11T15:55:52.360Z'),
        wakeTime: new Date('2026-05-11T18:26:21.131Z'),
        durationHours: 2.508,
        interruptionCount: 0,
        continuity: 0.78,
        regularity: 0.5,
        validCoverage: 0.36,
        confidence: 0.55,
        updatedAt: new Date('2026-05-12T02:00:00.000Z'),
      },
    ];

    const service = new ViewsService(
      repo(sleepDetections),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      repo([]),
    );

    const view = await service.getSleepView(
      'user-1',
      '2026-05-12',
      'Pacific/Chatham',
    );

    expect(view.header.bedtime).toBe('4:40 AM');
    expect(view.header.wakeTime).toBe('7:11 AM');
  });
});

describe('ViewsService.getCoverage', () => {
  function rawSensorRepoMock(rows: Array<{ day: string; minutes: number }>) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue(rows.map((r) => ({ day: r.day, minutes: String(r.minutes) }))),
    };
    return {
      createQueryBuilder: jest.fn(() => chain),
    } as any;
  }

  function makeService(rawSensorRepo: any) {
    return new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      rawSensorRepo,
    );
  }

  test('returns days[] with coverage label for each non-empty day', async () => {
    const svc = makeService(
      rawSensorRepoMock([
        { day: '2026-05-17', minutes: 1200 },
        { day: '2026-05-13', minutes: 400 },
        { day: '2026-05-15', minutes: 5 },
      ]),
    );
    const out = await svc.getCoverage('u', '2026-05', '2026-05', 'Asia/Kolkata');
    expect(out.days).toContainEqual({ date: '2026-05-17', coverage: 'full' });
    expect(out.days).toContainEqual({ date: '2026-05-13', coverage: 'partial' });
    // 5 minutes < MIN_MINUTES_FOR_DATA → dropped
    expect(out.days.find((d) => d.date === '2026-05-15')).toBeUndefined();
  });

  test('omits days with no records', async () => {
    const svc = makeService(rawSensorRepoMock([]));
    const out = await svc.getCoverage('u', '2026-05', '2026-05', 'Asia/Kolkata');
    expect(out.days).toEqual([]);
  });
});

describe('ViewsService monitors timeInZone', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-12T21:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function rawSensorWithHr(
    latest: { t: Date } | null,
    hrRows: Array<{ hr: string; t: Date }>,
  ): Repository<RawSensorRecord> {
    const chain = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(latest),
      getRawMany: jest.fn().mockResolvedValue(hrRows),
    };
    // Mock boundary: a jest double can't implement the full Repository surface.
    return {
      createQueryBuilder: jest.fn(() => chain),
    } as unknown as Repository<RawSensorRecord>;
  }

  it('reports stress time-in-zone in minutes, collapsing sub-minute samples', async () => {
    // Six daytime samples, two per wall-clock minute across three minutes, all
    // in the calm band. Counting samples would give 6; minutes gives 3.
    const mk = (iso: string) => ({ hr: '80', t: new Date(iso) });
    const hrRows = [
      mk('2026-05-12T19:00:05.000Z'),
      mk('2026-05-12T19:00:35.000Z'),
      mk('2026-05-12T19:01:05.000Z'),
      mk('2026-05-12T19:01:35.000Z'),
      mk('2026-05-12T19:02:05.000Z'),
      mk('2026-05-12T19:02:35.000Z'),
    ];
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
      rawSensorWithHr({ t: new Date('2026-05-12T19:02:35.000Z') }, hrRows),
    );

    const view = await service.getHomeView(
      'user-1',
      '2026-05-12',
      'America/Los_Angeles',
    );

    // 3 distinct minutes, not 6 samples.
    expect(view.monitors.stress.timeInZone.calm).toBe(3);
    expect(view.monitors.stress.timeInZone.moderate).toBe(0);
    expect(view.monitors.stress.timeInZone.high).toBe(0);
  });
});
