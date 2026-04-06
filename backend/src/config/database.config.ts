import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5434', 10),
    username: process.env.DB_USER || 'noop',
    password: process.env.DB_PASSWORD || 'noop_dev',
    database: process.env.DB_NAME || 'noop',
    autoLoadEntities: true,
    synchronize: true,
  };
}
