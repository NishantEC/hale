import { Between, Equal } from 'typeorm';

import { DebugService } from './debug.service';

function defaultQueryBuilder() {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ cnt: '0' }),
  };
}

function repo(overrides: Partial<Record<string, any>> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => defaultQueryBuilder()),
    ...overrides,
  } as any;
}

function emptyViewsService(): any {
  return {
    getHomeView: jest.fn().mockResolvedValue({
      selectedDateTitle: 'Today',
      todayOverview: { headline: '' },
      cards: { recommendation: { title: 'Steady' } },
    }),
    getSleepView: jest.fn().mockResolvedValue({
      selectedDateTitle: 'Today',
      emptyState: { isEmpty: true },
      header: { bedtime: '--', wakeTime: '--' },
    }),
  };
}

function emptyPipelineService(): any {
  return {};
}

function makeService(opts: {
  rawSensorRepo?: any;
  sleepDetectionRepo?: any;
  signalSampleRepo?: any;
} = {}) {
  const rawSensorRepo = opts.rawSensorRepo ?? repo();
  const sleepDetectionRepo = opts.sleepDetectionRepo ?? repo();
  const signalSampleRepo = opts.signalSampleRepo ?? repo();
  return new DebugService(
    emptyPipelineService(),
    emptyViewsService(),
    rawSensorRepo,
    sleepDetectionRepo,
    repo(),
    repo(),
    repo(),
    repo(),
    repo(),
    repo(),
    signalSampleRepo,
    repo(),
    repo(),
    repo(),
    repo(),
    repo(),
  );
}

describe('DebugService.getOverview enrichments', () => {
  const ORIGINAL_ENV = process.env.DEBUG_INSPECTOR_ENABLED;

  beforeAll(() => {
    process.env.DEBUG_INSPECTOR_ENABLED = 'true';
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.DEBUG_INSPECTOR_ENABLED;
    } else {
      process.env.DEBUG_INSPECTOR_ENABLED = ORIGINAL_ENV;
    }
  });

  it('returns latestSignalSampleAt from most recent signal_samples row', async () => {
    const latestTimestamp = new Date('2026-05-13T18:00:00.000Z');
    const signalSampleRepo = repo({
      findOne: jest.fn().mockImplementation((args: any) => {
        if (args?.order?.timestamp === 'DESC') {
          return Promise.resolve({ timestamp: latestTimestamp });
        }
        return Promise.resolve(null);
      }),
    });
    const service = makeService({ signalSampleRepo });

    const result = await service.getOverview('u1', '2026-05-14', 'UTC');

    expect(result.latestSignalSampleAt).toBe('2026-05-13T18:00:00.000Z');
  });

  it('returns recentNights for the 3 nights prior to selectedDate', async () => {
    const detectionByKey: Record<string, boolean> = {
      '2026-05-11': true,
      '2026-05-09': true,
    };
    const sleepDetectionRepo = repo({
      findOne: jest.fn().mockImplementation((args: any) => {
        const where = Array.isArray(args?.where) ? args.where[0] : args?.where;
        const op = where?.nightDate;
        // Production uses Between(start, end); FindOperator._value is the
        // pair [startDate, endDate]. Extract the start and format the day key.
        const raw = op?._value ?? op?.value;
        let key: string | undefined;
        if (Array.isArray(raw) && raw[0] instanceof Date) {
          key = raw[0].toISOString().slice(0, 10);
        } else if (typeof raw === 'string') {
          key = raw;
        }
        if (key && detectionByKey[key]) {
          return Promise.resolve({ id: `det-${key}` });
        }
        return Promise.resolve(null);
      }),
    });

    const rawCountsByDay: Record<string, number> = {
      '2026-05-13': 80,
      '2026-05-12': 0,
      '2026-05-11': 10311,
      '2026-05-14': 0,
    };
    const rawSensorRepo = repo({
      count: jest.fn().mockImplementation((args: any) => {
        const where = Array.isArray(args?.where) ? args.where[0] : args?.where;
        const between = where?.timestamp;
        const start: Date | undefined = between?._value?.[0] ?? between?.value?.[0];
        if (!start) return Promise.resolve(0);
        const startKey = start.toISOString().slice(0, 10);
        return Promise.resolve(rawCountsByDay[startKey] ?? 0);
      }),
    });

    const service = makeService({ sleepDetectionRepo, rawSensorRepo });

    const result = await service.getOverview('u1', '2026-05-14', 'UTC');

    expect(result.recentNights).toEqual([
      { nightDate: '2026-05-13', hasDetection: false, rawRecordCount: 80 },
      { nightDate: '2026-05-12', hasDetection: false, rawRecordCount: 0 },
      { nightDate: '2026-05-11', hasDetection: true, rawRecordCount: 10311 },
    ]);
  });

  it('returns todayCoverageMinutes = count of distinct UTC minute-buckets with at least one record today', async () => {
    const coverageBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ cnt: '22' }),
    };
    const rawSensorRepo = repo({
      createQueryBuilder: jest.fn((alias: string) => {
        if (alias === 'r') return coverageBuilder;
        return defaultQueryBuilder();
      }),
    });

    const service = makeService({ rawSensorRepo });

    const result = await service.getOverview('u1', '2026-05-14', 'UTC');

    expect(result.todayCoverageMinutes).toBe(22);
    expect(coverageBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("date_trunc('minute', r.timestamp)"),
      'cnt',
    );
  });
});
