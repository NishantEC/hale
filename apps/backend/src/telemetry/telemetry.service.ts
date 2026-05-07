import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceEvent } from './entities/device-event.entity.js';
import { RealtimeSample } from './entities/realtime-sample.entity.js';
import { ConsoleLog } from './entities/console-log.entity.js';
import { IngestEventsDto } from './dto/ingest-events.dto.js';
import { IngestRealtimeDto } from './dto/ingest-realtime.dto.js';
import { IngestConsoleLogsDto } from './dto/ingest-console-logs.dto.js';
import { parseConsoleLogMetadata } from './console-log-parser.js';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectRepository(DeviceEvent)
    private eventRepo: Repository<DeviceEvent>,
    @InjectRepository(RealtimeSample)
    private sampleRepo: Repository<RealtimeSample>,
    @InjectRepository(ConsoleLog)
    private consoleLogRepo: Repository<ConsoleLog>,
  ) {}

  async ingestEvents(userId: string, dto: IngestEventsDto): Promise<{ count: number }> {
    const entities = dto.events.map((e) =>
      this.eventRepo.create({
        userId,
        deviceId: e.deviceId,
        eventNumber: e.eventNumber,
        eventName: e.eventName,
        rawPayload: e.rawPayload ? Buffer.from(e.rawPayload, 'base64') : null,
        capturedAt: new Date(e.capturedAt),
      }),
    );
    const saved = await this.eventRepo.save(entities);
    return { count: saved.length };
  }

  async ingestRealtime(userId: string, dto: IngestRealtimeDto): Promise<{ count: number }> {
    const entities = dto.samples.map((s) =>
      this.sampleRepo.create({
        userId,
        deviceId: s.deviceId,
        sessionId: s.sessionId,
        dataType: s.dataType,
        heartRate: s.heartRate ?? null,
        rawFields: s.rawFields ?? null,
        rawPayload: s.rawPayload ? Buffer.from(s.rawPayload, 'base64') : null,
        capturedAt: new Date(s.capturedAt),
      }),
    );
    const saved = await this.sampleRepo.save(entities);
    return { count: saved.length };
  }

  async ingestConsoleLogs(userId: string, dto: IngestConsoleLogsDto): Promise<{ count: number }> {
    const entities = dto.logs.map((log) => {
      const cleanMessage = stripNullBytes(log.message);
      const parsed = parseConsoleLogMetadata(cleanMessage);
      const entity = new ConsoleLog();
      entity.userId = userId;
      entity.deviceId = stripNullBytes(log.deviceId);
      entity.message = cleanMessage;
      entity.logLevel = parsed.logLevel;
      entity.metadata = parsed.metadata ? sanitizeJsonNulls(parsed.metadata) : (null as any);
      entity.capturedAt = new Date(log.capturedAt);
      return entity;
    });
    const saved = await this.consoleLogRepo.save(entities);
    return { count: saved.length };
  }
}

/** Strip null bytes that PostgreSQL rejects in text/jsonb columns */
function stripNullBytes(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x00|\u0000/g, '');
}

/** Recursively strip null bytes from all string values in a JSON object */
function sanitizeJsonNulls(obj: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      clean[key] = stripNullBytes(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeJsonNulls(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
