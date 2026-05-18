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
    const userId = result[0].userId;
    req.user = { userId };

    // Opportunistic: any request that arrives with ?timeZone=<IANA>
    // updates user.timeZone if it differs. Cheap UPDATE WHERE timeZone IS
    // DISTINCT FROM. Lets the pipeline (and any other endpoint) fall back
    // to a persisted per-user TZ when a caller forgets to include the
    // query param — previously that path defaulted to UTC and corrupted
    // dayDate alignment for non-UTC users.
    const tz = (req.query?.timeZone ?? req.query?.tz) as string | undefined;
    if (tz && isValidIanaTimeZone(tz)) {
      // Best-effort fire-and-forget. A failure here must not block the request.
      this.dataSource
        .query(
          'UPDATE "user" SET "timeZone" = $1 WHERE id = $2 AND ("timeZone" IS DISTINCT FROM $1)',
          [tz, userId],
        )
        .catch(() => undefined);
    }

    return true;
  }
}

function isValidIanaTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
