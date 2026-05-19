import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { gzipSync } from 'zlib';
import {
  ComputeDerivedMetricsDayRequestV1,
  PersistedDailyMetricV1,
} from './compute-engine-types.js';

export type FallbackReason =
  | 'feature_flag_off'
  | 'network'
  | 'timeout'
  | 'server_error'
  | 'auth_error'
  | 'bad_request'
  | 'not_found'
  | 'client_error'
  | 'malformed_response'
  | 'bad_numeric';

export type ComputeDayResult =
  | { ok: true; result: PersistedDailyMetricV1; durationMs: number }
  | { ok: false; reason: FallbackReason; durationMs: number };

export interface ComputeDayContext {
  userId: string;
  runId: string;
  day: string;
}

@Injectable()
export class ComputeEngineClient {
  private readonly logger = new Logger(ComputeEngineClient.name);
  private auth = new GoogleAuth();
  private url = process.env.COMPUTE_ENGINE_URL ?? '';
  private timeoutMs = parseInt(
    process.env.COMPUTE_ENGINE_TIMEOUT_MS ?? '30000',
    10,
  );

  isEnabled(): boolean {
    this.url = process.env.COMPUTE_ENGINE_URL ?? '';
    return process.env.COMPUTE_ENGINE_ENABLED === 'true' && this.url.length > 0;
  }

  async computeDay(
    req: ComputeDerivedMetricsDayRequestV1,
    ctx: ComputeDayContext,
  ): Promise<ComputeDayResult> {
    const start = Date.now();
    if (!this.isEnabled()) {
      return { ok: false, reason: 'feature_flag_off', durationMs: 0 };
    }
    try {
      const client = await this.auth.getIdTokenClient(this.url);
      const body = gzipSync(Buffer.from(JSON.stringify(req)));
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      let res: any;
      try {
        res = await client.request({
          url: `${this.url}/v1/compute/derived-metrics-day`,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
            'accept-encoding': 'gzip',
            'x-run-id': ctx.runId,
          },
          data: body,
          validateStatus: () => true,
          signal: ac.signal as any,
          responseType: 'json',
        });
      } finally {
        clearTimeout(timer);
      }
      const status = res.status as number;
      if (status >= 500) return this.fallback('server_error', start, ctx, status);
      if (status === 401 || status === 403)
        return this.fallback('auth_error', start, ctx, status);
      if (status === 400) return this.fallback('bad_request', start, ctx, status);
      if (status === 404) return this.fallback('not_found', start, ctx, status);
      if (status >= 400) return this.fallback('client_error', start, ctx, status);
      const parsed = PersistedDailyMetricV1.safeParse(res.data);
      if (!parsed.success) {
        this.logger.warn({
          event: 'compute-engine-parse-failure',
          userId: ctx.userId,
          run_id: ctx.runId,
          day: ctx.day,
          errors: parsed.error.flatten(),
        });
        return this.fallback('malformed_response', start, ctx, status);
      }
      const v = parsed.data;
      const inRange = (x: number | null, lo: number, hi: number) =>
        x === null || (Number.isFinite(x) && x >= lo && x <= hi);
      if (!inRange(v.strainScore, 0, 21) || !inRange(v.recoveryIndex, 0, 100)) {
        return this.fallback('bad_numeric', start, ctx, status);
      }
      this.logger.log(
        JSON.stringify({
          event: 'compute-engine-success',
          endpoint: '/v1/compute/derived-metrics-day',
          outcome: 'rust_ok',
          userId: ctx.userId,
          run_id: ctx.runId,
          day: ctx.day,
          duration_ms: Date.now() - start,
        }),
      );
      return { ok: true, result: v, durationMs: Date.now() - start };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
        return this.fallback('timeout', start, ctx);
      }
      return this.fallback(
        'network',
        start,
        ctx,
        undefined,
        err?.code ?? err?.name ?? 'unknown',
      );
    }
  }

  private fallback(
    reason: FallbackReason,
    start: number,
    ctx: ComputeDayContext,
    httpStatus?: number,
    errorClass?: string,
  ): ComputeDayResult {
    const durationMs = Date.now() - start;
    this.logger.warn(
      JSON.stringify({
        event: 'compute-engine-fallback',
        endpoint: '/v1/compute/derived-metrics-day',
        outcome: `fallback_${reason}`,
        userId: ctx.userId,
        run_id: ctx.runId,
        day: ctx.day,
        reason,
        http_status: httpStatus,
        error_class: errorClass,
        duration_ms: durationMs,
      }),
    );
    return { ok: false, reason, durationMs };
  }
}
