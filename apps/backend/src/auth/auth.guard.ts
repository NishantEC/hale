import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.slice(7);

    const result = await this.dataSource.query(
      'SELECT "userId" FROM session WHERE token = $1 AND "expiresAt" > NOW() LIMIT 1',
      [token],
    );
    if (!result.length) throw new UnauthorizedException();
    req.user = { userId: result[0].userId };
    return true;
  }
}
