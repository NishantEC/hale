export type PostgresPoolOptions = {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
};

type PoolConfigInput = {
  maxEnv?: string;
  defaultMax?: number;
};

export function postgresPoolOptions({
  maxEnv = 'DB_POOL_MAX',
  defaultMax = 5,
}: PoolConfigInput = {}): PostgresPoolOptions {
  return {
    max: positiveInt(process.env[maxEnv], defaultMax),
    idleTimeoutMillis: positiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 10_000),
    connectionTimeoutMillis: positiveInt(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
      5_000,
    ),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
