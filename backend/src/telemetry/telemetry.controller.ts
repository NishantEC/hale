import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { TelemetryService } from './telemetry.service.js';
import { IngestEventsDto } from './dto/ingest-events.dto.js';
import { IngestRealtimeDto } from './dto/ingest-realtime.dto.js';
import { IngestConsoleLogsDto } from './dto/ingest-console-logs.dto.js';

@Controller('telemetry')
@UseGuards(SessionGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('events')
  async ingestEvents(@Req() req: any, @Body() body: IngestEventsDto) {
    return this.telemetryService.ingestEvents(req.user.userId, body);
  }

  @Post('realtime')
  async ingestRealtime(@Req() req: any, @Body() body: IngestRealtimeDto) {
    return this.telemetryService.ingestRealtime(req.user.userId, body);
  }

  @Post('console-logs')
  async ingestConsoleLogs(@Req() req: any, @Body() body: IngestConsoleLogsDto) {
    return this.telemetryService.ingestConsoleLogs(req.user.userId, body);
  }
}
