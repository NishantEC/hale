import { betterAuth } from 'better-auth';
import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';
import { postgresPoolOptions } from '../config/postgres-pool.js';

config({ path: resolve(process.cwd(), '.env') });

const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
const dbUser = process.env.DB_USER ?? 'noop';
const dbPassword = process.env.DB_PASSWORD ?? 'noop_dev';
const dbName = process.env.DB_NAME ?? 'noop';
const authPoolOptions = postgresPoolOptions({
  maxEnv: 'AUTH_DB_POOL_MAX',
  defaultMax: 2,
});

const pgPool = instanceConnectionName
  ? new Pool({
      host: `/cloudsql/${instanceConnectionName}`,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      ...authPoolOptions,
    })
  : new Pool({
      connectionString: `postgresql://${dbUser}:${dbPassword}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5434'}/${dbName}`,
      ...authPoolOptions,
    });

const extraTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: pgPool,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3009',
  emailAndPassword: {
    enabled: true,
  },
  // noop-specific demographic columns stored directly on the Better
  // Auth `user` table. Used by Healthspan (dateOfBirth required), and
  // by future features (biologicalSex / heightCm / weightKg are optional
  // hazard-model inputs). All optional, never required at sign-up.
  user: {
    additionalFields: {
      dateOfBirth: { type: 'date', required: false, input: true },
      biologicalSex: { type: 'string', required: false, input: true },
      heightCm: { type: 'number', required: false, input: true },
      weightKg: { type: 'number', required: false, input: true },
    },
  },
  trustedOrigins: [
    'http://localhost:3009',
    'http://localhost:5173',
    'http://localhost:5175',
    'https://4c2c-2a09-bac1-36e0-1468-00-243-a9.ngrok-free.app',
    // Production hostnames used by the iOS app — the React Native client
    // sets Origin to the BASE_URL it's configured against so the server
    // sees a same-origin request.
    'https://api.noop.enform.co',
    'https://noop-backend-z7lfiw76rq-uc.a.run.app',
    ...extraTrustedOrigins,
  ],
});
