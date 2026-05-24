import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

// Gates mutating debug endpoints to a small allowlist of admin emails
// set via DEBUG_ADMIN_EMAILS (comma-separated). Stacks AFTER SessionGuard
// so req.user.userId is already populated. Must NOT be used in place of
// SessionGuard.
//
// The mutating /debug/pipeline/run and /debug/views/recompute routes can
// hold a Cloud Run request slot for minutes while computing — exposing
// them to any authenticated user means one client can starve real traffic
// against the global concurrency budget. Until those routes are moved to
// the async job queue, admin-gating is the containment.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    const allowlist = parseAdminEmails(process.env.DEBUG_ADMIN_EMAILS);
    if (allowlist.size === 0) {
      // Fail closed: an unset/empty allowlist means nobody is admin.
      // Logging the userId helps an operator notice this is misconfigured.
      throw new ForbiddenException('Admin endpoint disabled (no DEBUG_ADMIN_EMAILS configured)');
    }

    const [row] = await this.dataSource.query(
      'SELECT email FROM "user" WHERE id = $1 LIMIT 1',
      [userId],
    );
    const email = (row?.email ?? '').toString().toLowerCase();
    if (!email || !allowlist.has(email)) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}

function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}
