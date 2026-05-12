import { readFileSync } from 'fs';
import { join } from 'path';
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

describe('PipelineService raw_sensor_records ingest', () => {
  it('uses the TypeORM insert alias when merging existing raw sensor columns', () => {
    const source = readFileSync(join(__dirname, 'pipeline.service.ts'), 'utf8');

    expect(source).toContain(
      ".createQueryBuilder('existing_raw_sensor_records')",
    );
    expect(source).toContain(
      '"existing_raw_sensor_records"."heartRate"',
    );
    expect(source).toContain(
      'COALESCE(EXCLUDED."rrAverageMs",      "existing_raw_sensor_records"."rrAverageMs")',
    );
    expect(source).not.toContain('raw_sensor_records."');
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
});
