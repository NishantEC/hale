"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseConfig = databaseConfig;
function databaseConfig() {
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
//# sourceMappingURL=database.config.js.map