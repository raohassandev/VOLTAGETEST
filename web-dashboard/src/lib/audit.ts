/**
 * Thin wrapper around prisma.auditLog.create().
 * Silently no-ops when the DB is not enabled so callers don't need guards.
 */
import { prisma, isDbEnabled } from "@/lib/db";

export interface AuditParams {
  userId: string | null;
  action: string;        // e.g. "settings.update", "user.create", "alarm_rule.delete"
  entity?: string;       // model name, e.g. "SystemSettings", "User"
  entityId?: string;
  data?: unknown;
  ip?: string | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  if (!isDbEnabled()) return;
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        data: params.data !== undefined ? (params.data as never) : undefined,
        ip: params.ip ?? null,
      },
    });
  } catch {
    // Non-critical — never fail the main request due to an audit write error.
  }
}

/** Extract the real client IP from a Next.js Request, best-effort. */
export function requestIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}
