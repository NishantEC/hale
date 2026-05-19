import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { gzipSync } from 'zlib';
import {
  ComputeBatchRequestV1,
  ComputeBatchResultV1,
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

export type ComputeBatchResult =
  | { ok: true; result: ComputeBatchResultV1; durationMs: number }
  | { ok: false; reason: FallbackReason; durationMs: number };

export interface ComputeDayContext {
  userId: string;
  runId: string;
  day: string;
}

export interface ComputeBatchContext {
  userId: string;
  runId: string;
  days: number;
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
      // gaxios (used by google-auth-library's client.request) silently strips
      // Content-Encoding: gzip and decompresses on the client side, which
      // means Cloud Run sees the full ~100 MiB raw body and 413s. Get the ID
      // token from the auth library, then use native fetch which preserves
      // headers and content bytes verbatim.
      const client = await this.auth.getIdTokenClient(this.url);
      const idToken = await client.idTokenProvider.fetchIdToken(this.url);
      const body = gzipSync(Buffer.from(JSON.stringify(req)));
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      let httpStatus: number;
      let rawBody: unknown;
      try {
        const res = await fetch(
          `${this.url}/v1/compute/derived-metrics-day`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'content-encoding': 'gzip',
              'accept-encoding': 'gzip',
              'x-run-id': ctx.runId,
              authorization: `Bearer ${idToken}`,
            },
            body,
            signal: ac.signal,
          },
        );
        httpStatus = res.status;
        rawBody =
          res.headers.get('content-type')?.includes('application/json')
            ? await res.json().catch(() => undefined)
            : await res.text().catch(() => undefined);
      } finally {
        clearTimeout(timer);
      }
      const status = httpStatus;
      if (status >= 500) return this.fallback('server_error', start, ctx, status);
      if (status === 401 || status === 403)
        return this.fallback('auth_error', start, ctx, status);
      if (status === 400) return this.fallback('bad_request', start, ctx, status);
      if (status === 404) return this.fallback('not_found', start, ctx, status);
      if (status >= 400) return this.fallback('client_error', start, ctx, status);
      const parsed = PersistedDailyMetricV1.safeParse(rawBody);
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

  /**
   * One HTTP call covering ALL reference days for a pipeline run. Rust loops
   * days internally and returns derivedMetricsByDay. Eliminates the per-day
   * client-side allocation cliff that Phase 1 hit at 4 GiB.
   */
  async computeBatch(
    req: ComputeBatchRequestV1,
    ctx: ComputeBatchContext,
  ): Promise<ComputeBatchResult> {
    const start = Date.now();
    if (!this.isEnabled()) {
      return { ok: false, reason: 'feature_flag_off', durationMs: 0 };
    }
    try {
      const client = await this.auth.getIdTokenClient(this.url);
      const idToken = await client.idTokenProvider.fetchIdToken(this.url);
      const body = gzipSync(Buffer.from(JSON.stringify(req)));
      const ac = new AbortController();
      // Batch endpoint can do up to 45 days of compute server-side; allow
      // longer client timeout.
      const batchTimeoutMs = parseInt(
        process.env.COMPUTE_ENGINE_BATCH_TIMEOUT_MS ?? '120000',
        10,
      );
      const timer = setTimeout(() => ac.abort(), batchTimeoutMs);
      let httpStatus: number;
      let rawBody: unknown;
      try {
        const res = await fetch(`${this.url}/v1/compute/batch`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
            'accept-encoding': 'gzip',
            'x-run-id': ctx.runId,
            authorization: `Bearer ${idToken}`,
          },
          body,
          signal: ac.signal,
        });
        httpStatus = res.status;
        rawBody = res.headers
          .get('content-type')
          ?.includes('application/json')
          ? await res.json().catch(() => undefined)
          : await res.text().catch(() => undefined);
      } finally {
        clearTimeout(timer);
      }
      const status = httpStatus;
      if (status >= 500)
        return this.batchFallback('server_error', start, ctx, status);
      if (status === 401 || status === 403)
        return this.batchFallback('auth_error', start, ctx, status);
      if (status === 400)
        return this.batchFallback('bad_request', start, ctx, status);
      if (status === 404)
        return this.batchFallback('not_found', start, ctx, status);
      if (status >= 400)
        return this.batchFallback('client_error', start, ctx, status);
      const parsed = ComputeBatchResultV1.safeParse(rawBody);
      if (!parsed.success) {
        this.logger.warn({
          event: 'compute-engine-parse-failure',
          endpoint: '/v1/compute/batch',
          userId: ctx.userId,
          run_id: ctx.runId,
          errors: parsed.error.flatten(),
        });
        return this.batchFallback('malformed_response', start, ctx, status);
      }
      const result = parsed.data;
      for (const entry of result.derivedMetricsByDay) {
        const v = entry.metrics;
        const inRange = (x: number | null, lo: number, hi: number) =>
          x === null || (Number.isFinite(x) && x >= lo && x <= hi);
        if (
          !inRange(v.strainScore, 0, 21) ||
          !inRange(v.recoveryIndex, 0, 100)
        ) {
          return this.batchFallback('bad_numeric', start, ctx, status);
        }
      }
      this.logger.log(
        JSON.stringify({
          event: 'compute-engine-success',
          endpoint: '/v1/compute/batch',
          outcome: 'rust_ok',
          userId: ctx.userId,
          run_id: ctx.runId,
          days: ctx.days,
          duration_ms: Date.now() - start,
        }),
      );
      return { ok: true, result, durationMs: Date.now() - start };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
        return this.batchFallback('timeout', start, ctx);
      }
      return this.batchFallback(
        'network',
        start,
        ctx,
        undefined,
        err?.code ?? err?.name ?? 'unknown',
      );
    }
  }

  private batchFallback(
    reason: FallbackReason,
    start: number,
    ctx: ComputeBatchContext,
    httpStatus?: number,
    errorClass?: string,
  ): ComputeBatchResult {
    const durationMs = Date.now() - start;
    this.logger.warn(
      JSON.stringify({
        event: 'compute-engine-fallback',
        endpoint: '/v1/compute/batch',
        outcome: `fallback_${reason}`,
        userId: ctx.userId,
        run_id: ctx.runId,
        days: ctx.days,
        reason,
        http_status: httpStatus,
        error_class: errorClass,
        duration_ms: durationMs,
      }),
    );
    return { ok: false, reason, durationMs };
  }
}
