import { PipelineService } from './pipeline.service';

function repoWithDeleteSpy() {
  const execute = jest.fn().mockResolvedValue({ affected: 1 });
  const andWhere = jest.fn().mockReturnThis();
  const where = jest.fn().mockReturnThis();
  const deleteBuilder = {
    delete: jest.fn().mockReturnThis(),
    where,
    andWhere,
    execute,
  };
  return {
    createQueryBuilder: jest.fn(() => deleteBuilder),
    deleteBuilder,
  };
}

function rawSensorRepoSpy() {
  const captured: { alias?: string; values?: any[]; onConflictArg?: string } = {};
  const execute = jest.fn().mockResolvedValue({ affected: 1 });
  const onConflict = jest.fn((arg: string) => {
    captured.onConflictArg = arg;
    return { execute };
  });
  const values = jest.fn((vals: any[]) => {
    captured.values = vals;
    return { onConflict };
  });
  const insert = jest.fn(() => ({ values }));
  const createQueryBuilder = jest.fn((alias: string) => {
    captured.alias = alias;
    return { insert };
  });
  return {
    repo: { createQueryBuilder } as any,
    captured,
    spies: { createQueryBuilder, insert, values, onConflict, execute },
  };
}

describe('PipelineService raw_sensor_records ingest', () => {
  it('upserts raw_sensor_records via the aliased insert + ON CONFLICT merge', async () => {
    const { repo: rawSensorRepo, captured } = rawSensorRepoSpy();
    const service = new PipelineService(
      {} as any, // sleepDetection
      {} as any, // sleepStage
      {} as any, // nightFeature
      {} as any, // dailyScore
      {} as any, // dailyMetric
      {} as any, // signalSample
      {} as any, // baseline
      {} as any, // journal
      {} as any, // sleepPlan
      rawSensorRepo, // rawSensor
      {} as any, // activityDetection
      {} as any, // healthkitSummary
      {} as any, // healthkitWorkout
      {} as any, // pipelineState
      {} as any, // pipelineRun
      {} as any, // deviceEvent
      {} as any, // dataSource
      { isEnabled: () => false } as any, // computeEngineClient
    );

    await service.ingest('user-1', {
      historicalSensorRecords: [
        {
          timestamp: '2026-05-12T03:00:00.000Z',
          heartRate: 65,
          rrAverageMs: 920,
          spo2Red: 1100,
          spo2IR: 1200,
        } as any,
      ],
    } as any);

    expect(captured.alias).toBe('existing_raw_sensor_records');
    expect(captured.values).toHaveLength(1);
    expect(captured.values?.[0]).toMatchObject({ userId: 'user-1', heartRate: 65 });
    // The merge clause must preserve existing HR when the new value is the 0
    // sentinel (validHeartRate sets junk readings to 0), and COALESCE all
    // other sensor columns onto the existing row.
    expect(captured.onConflictArg).toMatch(/"userId", timestamp/);
    expect(captured.onConflictArg).toMatch(
      /"heartRate"\s*=\s*CASE WHEN EXCLUDED\."heartRate" > 0 THEN EXCLUDED\."heartRate" ELSE "existing_raw_sensor_records"\."heartRate" END/,
    );
    expect(captured.onConflictArg).toMatch(
      /"rrAverageMs"\s*=\s*COALESCE\(EXCLUDED\."rrAverageMs",\s+"existing_raw_sensor_records"\."rrAverageMs"\)/,
    );
    expect(captured.onConflictArg).toMatch(
      /"signalQuality"\s*=\s*COALESCE\(EXCLUDED\."signalQuality",\s+"existing_raw_sensor_records"\."signalQuality"\)/,
    );
    // Guard against an unprefixed identifier creeping in.
    expect(captured.onConflictArg).not.toMatch(/(?<!_)raw_sensor_records"\./);
  });
});

describe('PipelineService ingestTable idempotency contract', () => {
  // The mobile drainer ships every uplink table through /pipeline/ingest-table
  // and assumes the backend dedupes on (tableName, rowId). For
  // raw_sensor_records, "rowId" is satisfied by the (userId, timestamp)
  // UNIQUE constraint — the mobile schema also keys raw rows on timestamp
  // so retrying the same payload produces the same bucket. These tests
  // pin that contract so a future refactor can't quietly break it.

  function svc(rawSensorRepo: any) {
    return new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any,
      rawSensorRepo,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any,
      { isEnabled: () => false } as any,
    );
  }

  it('routes raw_sensor_records to the (userId, timestamp) upsert', async () => {
    const { repo, captured } = rawSensorRepoSpy();
    const service = svc(repo);

    const res = await service.ingestTable('user-1', {
      tableName: 'raw_sensor_records',
      rows: [
        { timestamp: 1716552000000, heartRate: 65, gravityX: 0.1 } as any,
      ],
    } as any);

    expect(res).toEqual({ table: 'raw_sensor_records', stored: 1 });
    expect(captured.onConflictArg).toMatch(/"userId", timestamp/);
  });

  it('is idempotent: posting the same row twice yields the same ON CONFLICT clause', async () => {
    const { repo, captured } = rawSensorRepoSpy();
    const service = svc(repo);

    const row = {
      tableName: 'raw_sensor_records',
      rows: [{ timestamp: 1716552000000, heartRate: 65 } as any],
    };
    await service.ingestTable('user-1', row as any);
    const firstConflict = captured.onConflictArg;
    const firstValues = JSON.stringify(captured.values);

    await service.ingestTable('user-1', row as any);
    expect(captured.onConflictArg).toBe(firstConflict);
    expect(JSON.stringify(captured.values)).toBe(firstValues);
  });

  it('rejects unknown table names with 400 so the mobile drainer retains the row', async () => {
    const { repo } = rawSensorRepoSpy();
    const service = svc(repo);

    await expect(
      service.ingestTable('user-1', {
        tableName: 'made_up_table',
        rows: [{ id: 'r1' } as any],
      } as any),
    ).rejects.toThrow(/no handler registered for table "made_up_table"/);
  });

  it('returns zero stored when rows is empty without touching the DB', async () => {
    const { repo, spies } = rawSensorRepoSpy();
    const service = svc(repo);

    const res = await service.ingestTable('user-1', {
      tableName: 'raw_sensor_records',
      rows: [],
    } as any);

    expect(res).toEqual({ table: 'raw_sensor_records', stored: 0 });
    expect(spies.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('filters rows with non-finite timestamps before upserting', async () => {
    const { repo, captured } = rawSensorRepoSpy();
    const service = svc(repo);

    await service.ingestTable('user-1', {
      tableName: 'raw_sensor_records',
      rows: [
        { timestamp: 1716552000000, heartRate: 65 } as any,
        { timestamp: 'not-a-number', heartRate: 70 } as any,
        { timestamp: NaN, heartRate: 75 } as any,
      ],
    } as any);

    expect(captured.values).toHaveLength(1);
    expect((captured.values as any[])[0].heartRate).toBe(65);
  });
});

describe('PipelineService sweepStalePipelineRuns', () => {
  function pipelineRunRepoSpy(affected: number) {
    const execute = jest.fn().mockResolvedValue({ affected });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const setMock = jest.fn().mockReturnThis();
    const update = jest.fn().mockReturnThis();
    const qb = { update, set: setMock, where, andWhere, execute };
    const captured = { setCalledWith: undefined as any };
    setMock.mockImplementation((arg: any) => {
      captured.setCalledWith = arg;
      return qb;
    });
    return {
      repo: { createQueryBuilder: jest.fn(() => qb) } as any,
      captured,
      spies: { update, set: setMock, where, andWhere, execute },
    };
  }

  it('flips rows past heartbeat cutoff from running → failed', async () => {
    const { repo, spies, captured } = pipelineRunRepoSpy(3);
    const service = new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any,
      repo,
      {} as any, {} as any,
      { isEnabled: () => false } as any,
    );

    const recovered = await service.sweepStalePipelineRuns(60_000);

    expect(recovered).toBe(3);
    expect(spies.where).toHaveBeenCalledWith('status = :status', { status: 'running' });
    expect(spies.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('"heartbeatAt" IS NOT NULL'),
      expect.objectContaining({ cutoff: expect.any(Date) }),
    );
    expect(captured.setCalledWith).toMatchObject({ status: 'failed' });
    expect(captured.setCalledWith.error).toMatch(/heartbeat timeout/);
  });

  it('returns 0 when no rows are stale', async () => {
    const { repo } = pipelineRunRepoSpy(0);
    const service = new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any,
      repo,
      {} as any, {} as any,
      { isEnabled: () => false } as any,
    );

    const recovered = await service.sweepStalePipelineRuns();
    expect(recovered).toBe(0);
  });
});

describe('PipelineService derived cleanup', () => {
  it('deletes stale sleep-derived rows for observed days that are no longer computed', async () => {
    const repo = repoWithDeleteSpy();
    const service = new PipelineService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // dataSource
      { isEnabled: () => false } as any, // computeEngineClient
    );

    await (service as any).pruneStaleCalendarDayRows(
      repo,
      'user-1',
      'nightDate',
      [
        new Date('2026-05-09T18:30:00.000Z'),
        new Date('2026-05-11T18:30:00.000Z'),
      ],
      [new Date('2026-05-09T18:30:00.000Z')],
      'Asia/Kolkata',
    );

    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(repo.deleteBuilder.where).toHaveBeenCalledWith('"userId" = :userId', {
      userId: 'user-1',
    });
    expect(repo.deleteBuilder.andWhere).toHaveBeenCalledWith(
      '"nightDate" >= :start',
      { start: new Date('2026-05-11T18:30:00.000Z') },
    );
    expect(repo.deleteBuilder.andWhere).toHaveBeenCalledWith(
      '"nightDate" < :end',
      { end: new Date('2026-05-12T18:30:00.000Z') },
    );
    expect(repo.deleteBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it('skips pruning when every candidate day is in the kept set', async () => {
    const repo = repoWithDeleteSpy();
    const service = new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any,
      {} as any, // dataSource
      { isEnabled: () => false } as any, // computeEngineClient
    );

    await (service as any).pruneStaleCalendarDayRows(
      repo,
      'user-1',
      'nightDate',
      [new Date('2026-05-09T18:30:00.000Z'), new Date('2026-05-10T18:30:00.000Z')],
      [new Date('2026-05-09T18:30:00.000Z'), new Date('2026-05-10T18:30:00.000Z')],
      'Asia/Kolkata',
    );

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('deduplicates candidates by calendar key so distinct timestamps on the same local day prune once', async () => {
    const repo = repoWithDeleteSpy();
    const service = new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any,
      {} as any, // dataSource
      { isEnabled: () => false } as any, // computeEngineClient
    );

    // Two timestamps that fall on the same calendar day in the target TZ.
    await (service as any).pruneStaleCalendarDayRows(
      repo,
      'user-1',
      'nightDate',
      [
        new Date('2026-05-11T18:31:00.000Z'), // 2026-05-12 00:01 Asia/Kolkata
        new Date('2026-05-11T20:00:00.000Z'), // 2026-05-12 01:30 Asia/Kolkata
      ],
      [],
      'Asia/Kolkata',
    );

    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});

describe('PipelineService.findOneByCalendarDay merge invariant', () => {
  it('treats wall-clock-different timestamps on the same calendar day as the same row', async () => {
    // Two existing rows on the same local day with different UTC instants;
    // findOneByCalendarDay must surface one and self-heal the duplicate.
    const existingRows = [
      { id: 'a', nightDate: new Date('2026-05-11T19:00:00.000Z'), updatedAt: new Date('2026-05-12T01:00:00.000Z') }, // 2026-05-12 00:30 IST
      { id: 'b', nightDate: new Date('2026-05-12T01:00:00.000Z'), updatedAt: new Date('2026-05-12T02:00:00.000Z') }, // 2026-05-12 06:30 IST — newer
    ];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([existingRows[1], existingRows[0]]), // DESC by updatedAt
    };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const service = new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any,
      {} as any, // dataSource
      { isEnabled: () => false } as any, // computeEngineClient
    );

    const result = await (service as any).findOneByCalendarDay(
      repo,
      'user-1',
      'nightDate',
      new Date('2026-05-12T03:30:00.000Z'),
      'Asia/Kolkata',
    );

    // Picks the most-recently-updated row.
    expect(result?.id).toBe('b');
    // Self-heals the older duplicate.
    expect(repo.delete).toHaveBeenCalledWith(['a']);
  });

  it('returns null when no row matches the calendar day', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      delete: jest.fn(),
    };

    const service = new PipelineService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any,
      {} as any, // dataSource
      { isEnabled: () => false } as any, // computeEngineClient
    );

    const result = await (service as any).findOneByCalendarDay(
      repo,
      'user-1',
      'nightDate',
      new Date('2026-05-12T03:30:00.000Z'),
      'Asia/Kolkata',
    );

    expect(result).toBeNull();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
