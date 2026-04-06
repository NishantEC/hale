import { betterAuth } from 'better-auth';
import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';

config({ path: resolve(process.cwd(), '.env') });

const dbUrl = `postgresql://${process.env.DB_USER ?? 'noop'}:${process.env.DB_PASSWORD ?? 'noop_dev'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5434'}/${process.env.DB_NAME ?? 'noop'}`;
const extraTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: new Pool({ connectionString: dbUrl }),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3009',
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    'http://localhost:3009',
    'http://localhost:5173',
    'http://localhost:5175',
    'https://1719-2a09-bac5-3e0e-7eb-00-ca-51.ngrok-free.app',
    ...extraTrustedOrigins,
  ],
});
