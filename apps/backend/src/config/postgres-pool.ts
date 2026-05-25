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
  // db-f1-micro caps Postgres max_connections at 25. With maxScale=2 and
  // ~2 Cloud Run Job migrations during deploy, max=3 keeps us at
  // 2*3 + 2 = 8 connections — comfortably under the cap even with deploy
  // jobs overlapping. Bump this AND the SQL tier if we need real scale.
  defaultMax = 3,
}: PoolConfigInput = {}): PostgresPoolOptions {
  return {
    max: positiveInt(process.env[maxEnv], defaultMax),
    // 30 min — connections must survive long worker delegation awaits
    // (delegateToWorker has a 15-min HTTP timeout; the next DB query
    // post-await was hitting an idle-reaped connection).
    idleTimeoutMillis: positiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30 * 60_000),
    // 30s for cold-start connection establishment to the CloudSQL UNIX
    // socket. Was 5s; the new revision's first DB query after the worker
    // came back was timing out before the socket was warm.
    connectionTimeoutMillis: positiveInt(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
      30_000,
    ),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
