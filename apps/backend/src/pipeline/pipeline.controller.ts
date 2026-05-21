import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Query,
  HttpCode,
} from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { PipelineService } from './pipeline.service.js';
import { IngestDto } from './dto/ingest.dto.js';
import { IngestTableDto } from './dto/ingest-table.dto.js';

@Controller('pipeline')
@UseGuards(SessionGuard)
export class PipelineController {
  private readonly logger = new Logger(PipelineController.name);
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('ingest')
  @UsePipes(new ValidationPipe({ whitelist: false, transform: false }))
  async ingest(@Request() req, @Body() dto: IngestDto) {
    try {
      return await this.pipelineService.ingest(req.user.userId, dto);
    } catch (e) {
      this.logger.error(`ingest failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(`Ingest failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Generic store-and-forward endpoint used by the mobile outbound_queue
  // drainer. Same auth as /ingest. See PipelineService.ingestTable() for
  // per-table routing.
  @Post('ingest-table')
  async ingestTable(@Request() req, @Body() dto: IngestTableDto) {
    try {
      return await this.pipelineService.ingestTable(req.user.userId, dto);
    } catch (e) {
      this.logger.error(`ingest-table failed (table=${dto?.tableName}): ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(`Ingest-table failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Kicks off a pipeline run in the background and returns 202 + runId
  // immediately (codex adversarial review 2026-05-21, finding #3).
  // Concurrent POSTs for the same user that arrive while a run is
  // already queued/running return that runId — the work is idempotent.
  // Clients poll GET /pipeline/run/:id for completion.
  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(
    @Request() req,
    @Query('timeZone') timeZone?: string,
    @Query('tz') tz?: string,
  ) {
    try {
      return await this.pipelineService.enqueuePipelineRun(
        req.user.userId,
        timeZone ?? tz,
      );
    } catch (e) {
      this.logger.error(`pipeline run enqueue failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        `Pipeline run enqueue failed: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Poll endpoint for the runId returned by POST /pipeline/run. Returns
  // status (queued|running|succeeded|failed) plus completedAt + error
  // when terminal. Clients are expected to call this every few seconds
  // until status leaves the queued/running set.
  @Get('run/:id')
  async runStatus(@Request() req, @Param('id') id: string) {
    try {
      return await this.pipelineService.getPipelineRunStatus(req.user.userId, id);
    } catch (e) {
      this.logger.error(`pipeline run status fetch failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        `Pipeline run status failed: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('results')
  async results(@Request() req) {
    try {
      return await this.pipelineService.getResults(req.user.userId);
    } catch (e) {
      this.logger.error(`results fetch failed: ${e.message}`, e.stack);
      if (e instanceof HttpException) throw e;
      throw new HttpException(`Results failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
