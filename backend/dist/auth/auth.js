"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const better_auth_1 = require("better-auth");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const pg_1 = require("pg");
(0, dotenv_1.config)({ path: (0, path_1.resolve)(process.cwd(), '.env') });
const dbUrl = `postgresql://${process.env.DB_USER ?? 'noop'}:${process.env.DB_PASSWORD ?? 'noop_dev'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5434'}/${process.env.DB_NAME ?? 'noop'}`;
const extraTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
exports.auth = (0, better_auth_1.betterAuth)({
    database: new pg_1.Pool({ connectionString: dbUrl }),
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
//# sourceMappingURL=auth.js.map