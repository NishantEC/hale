import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class SessionGuard implements CanActivate {
    private dataSource;
    constructor(dataSource: DataSource);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
