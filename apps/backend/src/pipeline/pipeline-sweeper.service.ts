import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PipelineService } from './pipeline.service.js';

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

  constructor(private readonly pipelineService: PipelineService) {}

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
}
