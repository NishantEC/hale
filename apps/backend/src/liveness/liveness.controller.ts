import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Liveness + readiness probes for uptime monitors (Healthchecks.io,
// Better Stack, GCP uptime checks). Intentionally outside SessionGuard
// — the whole point is to be pingable without auth.

@Controller()
export class LivenessController {
  constructor(private readonly dataSource: DataSource) {}

  // Bare "the process is running" probe. Cheap, no DB. Use this for
  // process-level uptime monitors.
  @Get('livez')
  livez() {
    return { ok: true, uptimeSeconds: Math.round(process.uptime()) };
  }

  // Readiness — process is up AND the database round-trips. Use this
  // for "is the service actually serving requests?" monitors.
  @Get('readyz')
  async readyz() {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        ok: true,
        dbLatencyMs: Date.now() - started,
        uptimeSeconds: Math.round(process.uptime()),
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message ?? 'db unreachable',
        uptimeSeconds: Math.round(process.uptime()),
      };
    }
  }
}
