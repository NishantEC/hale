import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConfig(): TypeOrmModuleOptions {
  // When deployed on Cloud Run with a Cloud SQL attachment, the platform
  // provides a Unix socket at /cloudsql/<INSTANCE_CONNECTION_NAME>. The pg
  // driver treats `host` as a socket path when it begins with a slash and
  // ignores `port` in that case.
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
  const socketHost = instanceConnectionName
    ? `/cloudsql/${instanceConnectionName}`
    : undefined;

  const host = socketHost ?? process.env.DB_HOST ?? 'localhost';
  const useSocket = host.startsWith('/');

  return {
    type: 'postgres',
    host,
    ...(useSocket ? {} : { port: parseInt(process.env.DB_PORT ?? '5434', 10) }),
    username: process.env.DB_USER || 'noop',
    password: process.env.DB_PASSWORD || 'noop_dev',
    database: process.env.DB_NAME || 'noop',
    autoLoadEntities: true,
    // Schema is now managed by TypeORM migrations (see src/migrations/).
    // Keep synchronize:true only for local dev when explicitly requested
    // via DB_SYNCHRONIZE=true — never in production.
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    migrationsRun: false,
  };
}
