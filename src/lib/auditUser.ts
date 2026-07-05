import prisma from '@/lib/prisma';

/**
 * Resolves a valid userId for audit logs.
 * Checks if the provided ID exists, otherwise falls back to the first user in the DB.
 * Returns null only if there are zero users in the system.
 */
export async function resolveAuditUserId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  candidateId?: string | null
): Promise<string | null> {
  if (candidateId) {
    const exists = await tx.user.findUnique({ where: { id: candidateId }, select: { id: true } });
    if (exists) return exists.id;
  }
  const fallback = await tx.user.findFirst({ select: { id: true } });
  return fallback?.id || null;
}
