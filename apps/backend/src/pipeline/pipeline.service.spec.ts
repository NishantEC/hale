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
      {} as any,
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
      {} as any,
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
      {} as any,
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
      {} as any,
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
