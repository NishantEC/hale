import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineService } from './pipeline.service.js';
import { RawSensorRecord } from './entities/raw-sensor-record.entity.js';
import { PipelineState } from './entities/pipeline-state.entity.js';

// Periodic stale-run recovery. Any pipeline_runs row stuck at
// status='running' past the heartbeat threshold (default 5 min in
// sweepStalePipelineRuns) gets flipped to 'failed', releasing the
// per-user inflight partial index so a fresh /pipeline/run can be
// enqueued.
//
// Without this, a worker dying mid-run leaves the row in 'running'
// forever and the dedupe partial index blocks every subsequent
// enqueue for that user.
//
// Cron cadence is every 2 minutes — comfortably more frequent than
// the 5-minute heartbeat threshold without being so chatty that it
// dominates DB load.
@Injectable()
export class PipelineSweeperService {
  private readonly logger = new Logger(PipelineSweeperService.name);

  constructor(
    private readonly pipelineService: PipelineService,
    @InjectRepository(RawSensorRecord)
    private readonly rawSensorRepo: Repository<RawSensorRecord>,
    @InjectRepository(PipelineState)
    private readonly pipelineStateRepo: Repository<PipelineState>,
  ) {}

  @Cron('*/2 * * * *')
  async sweep(): Promise<void> {
    try {
      const recovered = await this.pipelineService.sweepStalePipelineRuns();
      if (recovered > 0) {
        this.logger.warn(
          `pipeline-sweeper: recovered ${recovered} stale run(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `pipeline-sweeper: tick failed — ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }

  // Auto-trigger pipeline for any user whose raw_sensor_records is fresher
  // than their pipeline_state watermark. Runs every 5 min — the app no
  // longer needs to fire /pipeline/run after sync; if new raw data lands,
  // backend notices and runs the pipeline within ~5 min.
  @Cron('*/5 * * * *')
  async autoTriggerStaleUsers(): Promise<void> {
    try {
      // SQL: find users where max(raw_sensor_records.updatedAt) >
      // pipeline_state.lastInputMaxUpdatedAt (or pipeline_state missing).
      const rows: Array<{ userId: string }> = await this.rawSensorRepo
        .createQueryBuilder('r')
        .select('r."userId"', 'userId')
        .addSelect('MAX(r."updatedAt")', 'rawMax')
        .leftJoin(
          'pipeline_state',
          'ps',
          'ps."userId" = r."userId"',
        )
        .addSelect('ps."lastInputMaxUpdatedAt"', 'stateMax')
        .groupBy('r."userId"')
        .addGroupBy('ps."lastInputMaxUpdatedAt"')
        .having(
          '(ps."lastInputMaxUpdatedAt" IS NULL OR MAX(r."updatedAt") > ps."lastInputMaxUpdatedAt")',
        )
        .getRawMany();

      if (rows.length === 0) return;

      this.logger.log(
        `auto-trigger: ${rows.length} user(s) have fresh raw data; enqueuing pipeline runs`,
      );
      for (const row of rows) {
        try {
          await this.pipelineService.enqueuePipelineRun(row.userId, undefined);
        } catch (err: any) {
          // enqueue dedupe (another run already queued/running) is fine.
          this.logger.debug(
            `auto-trigger: enqueue skipped for ${row.userId}: ${err?.message ?? err}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `auto-trigger: tick failed — ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
