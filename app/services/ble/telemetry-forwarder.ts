import { apiPost } from '../api/noopClient';

interface ForwarderOptions {
  flushIntervalMs?: number;
  flushThreshold?: number;
}

/**
 * Generic batching forwarder for telemetry data.
 * Buffers items and periodically flushes them to a backend endpoint.
 * Retries failed batches on the next flush cycle.
 */
export class TelemetryForwarder<T> {
  private buffer: T[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly endpoint: string;
  private readonly wrapperKey: string;
  private readonly flushIntervalMs: number;
  private readonly flushThreshold: number;
  private readonly label: string;

  constructor(
    endpoint: string,
    wrapperKey: string,
    opts: ForwarderOptions & { label?: string } = {},
  ) {
    this.endpoint = endpoint;
    this.wrapperKey = wrapperKey;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5_000;
    this.flushThreshold = opts.flushThreshold ?? 100;
    this.label = opts.label ?? 'TelemetryForwarder';
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  push(item: T) {
    this.buffer.push(item);
    if (this.buffer.length >= this.flushThreshold) {
      this.flush();
    }
  }

  pushMany(items: T[]) {
    this.buffer.push(...items);
    if (this.buffer.length >= this.flushThreshold) {
      this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await apiPost(this.endpoint, { [this.wrapperKey]: batch });
    } catch (err) {
      this.buffer.unshift(...batch);
      console.warn(`[${this.label}] flush failed, will retry:`, (err as Error).message);
    }
  }
}

// ── Typed payload interfaces ────────────────────────────────

export interface DeviceEventPayload {
  deviceId: string;
  eventNumber: number;
  eventName: string;
  rawPayload: string | null;
  capturedAt: string;
}

export interface RealtimeSamplePayload {
  deviceId: string;
  sessionId: string;
  dataType: 'hr' | 'raw';
  heartRate?: number | null;
  rawFields?: Record<string, any> | null;
  rawPayload?: string | null;
  capturedAt: string;
}

export interface ConsoleLogPayload {
  deviceId: string;
  message: string;
  capturedAt: string;
}

// ── Pre-configured forwarder factories ──────────────────────

export function createEventForwarder() {
  return new TelemetryForwarder<DeviceEventPayload>(
    '/telemetry/events',
    'events',
    { flushIntervalMs: 5_000, flushThreshold: 100, label: 'EventForwarder' },
  );
}

export function createRealtimeForwarder() {
  return new TelemetryForwarder<RealtimeSamplePayload>(
    '/telemetry/realtime',
    'samples',
    { flushIntervalMs: 15_000, flushThreshold: 200, label: 'RealtimeForwarder' },
  );
}

export function createConsoleLogForwarder() {
  return new TelemetryForwarder<ConsoleLogPayload>(
    '/telemetry/console-logs',
    'logs',
    { flushIntervalMs: 5_000, flushThreshold: 50, label: 'ConsoleLogForwarder' },
  );
}

// ── Session-aware realtime helper ───────────────────────────

function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Thin wrapper around TelemetryForwarder that manages session IDs
 * and provides pushHR/pushRaw convenience methods.
 */
export class RealtimeSessionForwarder {
  private inner = createRealtimeForwarder();
  private deviceId: string | null = null;
  private sessionId: string | null = null;

  startSession(deviceId: string) {
    this.endSession();
    this.deviceId = deviceId;
    this.sessionId = generateSessionId();
    this.inner.start();
  }

  endSession() {
    this.inner.stop();
    this.deviceId = null;
    this.sessionId = null;
  }

  pushHR(heartRate: number, rawPayload: string | null, capturedAt: string) {
    if (!this.deviceId || !this.sessionId) return;
    this.inner.push({
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      dataType: 'hr',
      heartRate,
      rawPayload,
      capturedAt,
    });
  }

  pushRaw(rawFields: Record<string, any> | null, rawPayload: string | null, capturedAt: string) {
    if (!this.deviceId || !this.sessionId) return;
    this.inner.push({
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      dataType: 'raw',
      rawFields,
      rawPayload,
      capturedAt,
    });
  }
}

// ── Console log line-buffering wrapper ──────────────────────

/**
 * Buffers BLE text fragments into complete lines before forwarding.
 */
export class ConsoleLogLineForwarder {
  private inner = createConsoleLogForwarder();
  private lineBuffer = '';
  private deviceId: string | null = null;

  start(deviceId: string) {
    this.deviceId = deviceId;
    this.inner.start();
  }

  push(text: string) {
    if (!this.deviceId) return;
    // Strip null bytes — firmware output contains \x00 which PostgreSQL rejects
    this.lineBuffer += text.replace(/\0/g, '');
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    const now = new Date().toISOString();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      console.log('[StrapLog]', trimmed);
      this.inner.push({ deviceId: this.deviceId, message: trimmed, capturedAt: now });
    }
  }

  stop() {
    if (this.lineBuffer.trim().length > 0 && this.deviceId) {
      const trimmed = this.lineBuffer.trim();
      console.log('[StrapLog]', trimmed);
      this.inner.push({ deviceId: this.deviceId, message: trimmed, capturedAt: new Date().toISOString() });
      this.lineBuffer = '';
    }
    this.inner.stop();
    this.deviceId = null;
  }
}
