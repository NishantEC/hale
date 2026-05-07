import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { PipelineService } from './pipeline.service.js';
import { IngestDto } from './dto/ingest.dto.js';

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
      throw new HttpException(`Ingest failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('run')
  async run(@Request() req) {
    try {
      return await this.pipelineService.runPipeline(req.user.userId);
    } catch (e) {
      this.logger.error(`pipeline run failed: ${e.message}`, e.stack);
      throw new HttpException(`Pipeline run failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('results')
  async results(@Request() req) {
    try {
      return await this.pipelineService.getResults(req.user.userId);
    } catch (e) {
      this.logger.error(`results fetch failed: ${e.message}`, e.stack);
      throw new HttpException(`Results failed: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
