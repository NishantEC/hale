import { DataSource } from 'typeorm';

// Standalone DataSource used by the TypeORM CLI for `migration:generate`
// and `migration:run`. We deliberately don't import the runtime
// databaseConfig() because the CLI is invoked via ts-node-commonjs which
// can't follow the .js extension imports the runtime uses.
const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
const host = instanceConnectionName
  ? `/cloudsql/${instanceConnectionName}`
  : (process.env.DB_HOST ?? 'localhost');
const useSocket = host.startsWith('/');

export default new DataSource({
  type: 'postgres',
  host,
  ...(useSocket ? {} : { port: parseInt(process.env.DB_PORT ?? '5434', 10) }),
  username: process.env.DB_USER || 'noop',
  password: process.env.DB_PASSWORD || 'noop_dev',
  database: process.env.DB_NAME || 'noop',
  entities: [
    __dirname + '/**/*.entity.js',
    __dirname + '/**/*.entity.ts',
  ],
  migrations: [
    __dirname + '/migrations/*.js',
    __dirname + '/migrations/*.ts',
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
