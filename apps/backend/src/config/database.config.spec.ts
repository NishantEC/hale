import { databaseConfig } from './database.config';

describe('databaseConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DB_POOL_MAX;
    delete process.env.DB_POOL_IDLE_TIMEOUT_MS;
    delete process.env.DB_POOL_CONNECTION_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('caps the runtime Postgres pool by default', () => {
    expect(databaseConfig()).toMatchObject({
      extra: {
        max: 5,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
      },
    });
  });

  it('allows production pool limits to be tuned with environment variables', () => {
    process.env.DB_POOL_MAX = '8';
    process.env.DB_POOL_IDLE_TIMEOUT_MS = '15000';
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = '3000';

    expect(databaseConfig()).toMatchObject({
      extra: {
        max: 8,
        idleTimeoutMillis: 15_000,
        connectionTimeoutMillis: 3_000,
      },
    });
  });
});
