import nock from 'nock';

jest.mock('google-auth-library', () => {
  const actual = jest.requireActual('google-auth-library');
  return {
    ...actual,
    GoogleAuth: jest.fn().mockImplementation(() => ({
      // Production code reads `client.idTokenProvider.fetchIdToken(url)` and
      // then issues its own fetch — the mock only needs to hand back a token.
      // We also expose `request()` for legacy callers that may still use it.
      getIdTokenClient: async () => ({
        idTokenProvider: {
          fetchIdToken: async () => 'test-id-token',
        },
        request: async (opts: any) => {
          const res = await fetch(opts.url, {
            method: opts.method,
            headers: opts.headers,
            body: opts.data,
            signal: opts.signal,
          });
          const text = await res.text();
          let data: any = undefined;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
          return { status: res.status, data };
        },
      }),
    })),
  };
});

import { ComputeEngineClient } from './compute-engine-client';

const sampleRequest = () => ({
  schemaVersion: 1 as const,
  samples: [],
  sensorRecords: [],
  nightFeatures: [],
  sleepDetections: [],
  baseline: {
    restingHeartRate: 60,
    rmssd: 50,
    sdnn: 60,
    nightsUsed: 5,
    isWarmedUp: true,
    maxHeartRate: 190,
  },
  referenceDate: '2026-01-01',
  timeZone: 'UTC',
});

const ctx = { userId: 'u1', runId: 'r1', day: '2026-01-01' };

const goldenExpected = () => ({
  schemaVersion: 1,
  strainScore: 5,
  sleepConsistencyScore: 80,
  detectedSleepNights: 5,
  skinTempAvgCelsius: 33.5,
  skinTempDeltaCelsius: 0.1,
  stressAverage: 0.85,
  spo2Average: 97.0,
  lfHfRatioAverage: null,
  recoveryIndex: 70,
  trainingLoadRatio: 1.0,
  trainingLoadRiskZone: 'optimal',
  spo2DipCount: 0,
  odiPerHour: null,
  lowestSpo2: 96.0,
  coreTemperatureEstimate: null,
  circadianNadir: null,
  sleepArchitectureScore: null,
});

describe('ComputeEngineClient fallback semantics', () => {
  const origEnabled = process.env.COMPUTE_ENGINE_ENABLED;
  const origUrl = process.env.COMPUTE_ENGINE_URL;

  beforeEach(() => {
    process.env.COMPUTE_ENGINE_ENABLED = 'true';
    process.env.COMPUTE_ENGINE_URL = 'http://example.test';
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    process.env.COMPUTE_ENGINE_ENABLED = origEnabled;
    process.env.COMPUTE_ENGINE_URL = origUrl;
  });

  it('feature_flag_off when disabled', async () => {
    process.env.COMPUTE_ENGINE_ENABLED = 'false';
    const c = new ComputeEngineClient();
    expect(c.isEnabled()).toBe(false);
    const r = await c.computeDay(sampleRequest(), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('feature_flag_off');
  });

  it('falls back on 5xx with reason=server_error', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(503, 'busy');
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('server_error');
  });

  it('falls back on 401 with reason=auth_error', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(401, 'no');
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('auth_error');
  });

  it('falls back on 403 with reason=auth_error', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(403, 'forbidden');
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('auth_error');
  });

  it('falls back on 400 with reason=bad_request', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(400, { error: 'unsupported schemaVersion' });
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_request');
  });

  it('falls back on 404 with reason=not_found', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(404, 'missing');
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_found');
  });

  it('falls back on 418 with reason=client_error', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(418, 'teapot');
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('client_error');
  });

  it('falls back on schemaVersion mismatch with reason=malformed_response', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(200, { schemaVersion: 2 });
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_response');
  });

  it('falls back on out-of-range strain with reason=bad_numeric', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(200, { ...goldenExpected(), strainScore: 99 });
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_numeric');
  });

  it('falls back on out-of-range recoveryIndex with reason=bad_numeric', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(200, { ...goldenExpected(), recoveryIndex: 250 });
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_numeric');
  });

  it('returns ok with parsed result on 200', async () => {
    nock('http://example.test')
      .post('/v1/compute/derived-metrics-day')
      .reply(200, goldenExpected());
    const r = await new ComputeEngineClient().computeDay(
      sampleRequest(),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.strainScore).toBe(5);
      expect(r.result.trainingLoadRiskZone).toBe('optimal');
      expect(r.result.recoveryIndex).toBe(70);
    }
  });
});
