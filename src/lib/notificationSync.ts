import prisma from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';

// ── Types ────────────────────────────────────────────────────────

interface NewNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  referenceId: string;
}

export interface SyncResult {
  created: number;
  dismissed: number;
  deleted: number;
  pushed: number;
}

// ── Role-based notification filter ──────────────────────────────
// admin/staff → all types (they manage inventory, stock, deliveries)
// cashier → delivery only (they handle orders/POS)

const ROLE_ALLOWED_TYPES: Record<string, string[]> = {
  admin: ['low_stock', 'expiry', 'delivery', 'system'],
  staff: ['low_stock', 'expiry', 'delivery', 'system'],
  cashier: ['delivery'],
};

function getAllowedTypes(role: string): string[] {
  return ROLE_ALLOWED_TYPES[role] || ROLE_ALLOWED_TYPES['staff'];
}

// ── Core Sync Logic ─────────────────────────────────────────────

/**
 * Syncs notifications for a single user:
 * 1. Detects current conditions (low stock, expiry, pending delivery)
 * 2. Creates new notifications (deduplicated, including dismissed ones)
 * 3. Auto-resolves stale notifications
 * 4. Optionally sends push notifications
 *
 * @param userId - The user ID to sync notifications for
 * @param userRole - The user's role (admin, staff, cashier)
 * @param sendPush - Whether to send push notifications for new alerts
 */
export async function syncNotificationsForUser(
  userId: string,
  userRole: string,
  sendPush: boolean = true
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, dismissed: 0, deleted: 0, pushed: 0 };
  const allowedTypes = getAllowedTypes(userRole);

  const settings = await prisma.systemSettings.findFirst() || { expiryWarningDays: 30 };

  // ── 1. Low Stock Detection ──────────────────────────────────
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let lowStockProducts: any[] = [];
  if (allowedTypes.includes('low_stock')) {
    const allProducts = await prisma.product.findMany({
      where: { isArchived: false }
    });
    lowStockProducts = allProducts.filter(p => p.stock <= p.minStock);
  }

  // ── 2. Expiry Detection ─────────────────────────────────────
  const today = new Date();
  let expiringBatches: any[] = [];
  if (allowedTypes.includes('expiry')) {
    const expiryThreshold = new Date();
    expiryThreshold.setDate(today.getDate() + settings.expiryWarningDays);
    expiringBatches = await prisma.batch.findMany({
      where: {
        expiryDate: { lte: expiryThreshold },
        stock: { gt: 0 }
      },
      include: { product: true }
    });
  }

  // ── 3. Pending Deliveries Detection ─────────────────────────
  let pendingDeliveries: any[] = [];
  if (allowedTypes.includes('delivery')) {
    pendingDeliveries = await prisma.delivery.findMany({
      where: { status: 'pending' },
      include: { order: true }
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Fetch ALL existing notifications (including dismissed) ──
  // We check dismissed ones too so we don't recreate notifications
  // the user already dismissed. This prevents the "keeps coming back" bug.
  const existingNotifications = await prisma.notification.findMany({
    where: { userId },
    select: { id: true, referenceId: true, type: true, isDismissed: true }
  });

  const existingKeys = new Set(
    existingNotifications.map(n => `${n.type}::${n.referenceId}`)
  );

  // ── Collect new notifications ─────────────────────────────────
  const toCreate: NewNotification[] = [];

  // Low Stock alerts
  for (const product of lowStockProducts) {
    const key = `low_stock::${product.id}`;
    if (!existingKeys.has(key)) {
      toCreate.push({
        userId,
        type: 'low_stock',
        title: 'Low Stock Alert',
        message: `${product.name} (${product.sku}) is running low! Only ${product.stock} left.`,
        link: `/inventory?search=${product.sku}`,
        referenceId: product.id
      });
    }
  }

  // Expiry alerts
  for (const batch of expiringBatches) {
    if (!batch.expiryDate) continue;
    const daysLeft = Math.ceil((batch.expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    const key = `expiry::${batch.id}`;
    if (!existingKeys.has(key)) {
      const isExpired = daysLeft <= 0;
      toCreate.push({
        userId,
        type: 'expiry',
        title: isExpired ? 'Expired Product Alert' : 'Expiry Warning',
        message: isExpired
          ? `Batch ${batch.batchNumber} of ${batch.product.name} expired ${Math.abs(daysLeft)} day(s) ago! ${batch.stock} units remaining.`
          : `Batch ${batch.batchNumber} of ${batch.product.name} expires in ${daysLeft} day(s).`,
        link: `/inventory?search=${batch.product.sku}`,
        referenceId: batch.id
      });
    }
  }

  // Pending Delivery alerts
  for (const delivery of pendingDeliveries) {
    const key = `delivery::${delivery.id}`;
    if (!existingKeys.has(key)) {
      toCreate.push({
        userId,
        type: 'delivery',
        title: 'Pending Delivery',
        message: `Order #${delivery.order.orderNumber} is pending delivery.`,
        link: `/orders`,
        referenceId: delivery.id
      });
    }
  }

  // ── Auto-resolve stale notifications ──────────────────────────
  // If a condition is no longer true, clean up the notification:
  // - Non-dismissed stale → set isDismissed: true (soft delete)
  // - Already-dismissed stale → DELETE from DB entirely
  //   (so if the condition recurs later, a new notification can be created)
  const activeProductIds = new Set(lowStockProducts.map(p => p.id));
  const activeBatchIds = new Set(expiringBatches.map(b => b.id));
  const activeDeliveryIds = new Set(pendingDeliveries.map(d => d.id));

  const staleNotifications = existingNotifications.filter(n => {
    if (!n.referenceId) return false;
    // Only check types this role cares about
    if (!allowedTypes.includes(n.type)) return false;
    if (n.type === 'low_stock' && !activeProductIds.has(n.referenceId)) return true;
    if (n.type === 'expiry' && !activeBatchIds.has(n.referenceId)) return true;
    if (n.type === 'delivery' && !activeDeliveryIds.has(n.referenceId)) return true;
    return false;
  });

  // Split stale into: dismissed (DELETE) vs active (DISMISS)
  const staleDismissedIds = staleNotifications
    .filter(n => n.isDismissed)
    .map(n => n.id);

  const staleActiveReferenceIds = staleNotifications
    .filter(n => !n.isDismissed)
    .map(n => n.referenceId)
    .filter((id): id is string => id !== null);

  // ── Execute DB writes in a single transaction ─────────────────
  await prisma.$transaction(async (tx) => {
    // Create new notifications
    if (toCreate.length > 0) {
      await tx.notification.createMany({ data: toCreate });
      result.created = toCreate.length;
    }

    // Dismiss stale active notifications
    if (staleActiveReferenceIds.length > 0) {
      const dismissed = await tx.notification.updateMany({
        where: {
          userId,
          referenceId: { in: staleActiveReferenceIds },
          isDismissed: false
        },
        data: { isDismissed: true }
      });
      result.dismissed = dismissed.count;
    }

    // Delete stale dismissed notifications (allow future recreation)
    if (staleDismissedIds.length > 0) {
      const deleted = await tx.notification.deleteMany({
        where: { id: { in: staleDismissedIds } }
      });
      result.deleted = deleted.count;
    }
  });

  // ── Send push notifications (fire-and-forget) ────────────────
  if (sendPush && toCreate.length > 0) {
    try {
      const pushResults = await Promise.allSettled(
        toCreate.map(notif =>
          sendPushToUser(userId, {
            title: notif.title,
            message: notif.message,
            link: notif.link,
            type: notif.type
          })
        )
      );
      result.pushed = pushResults.filter(r => r.status === 'fulfilled').length;
    } catch (err) {
      console.error('Push notification error:', err);
    }
  }

  return result;
}

// ── Sync for ALL users (used by cron) ───────────────────────────

/**
 * Runs notification sync for all users in the system.
 * Used by the cron endpoint for background push notifications
 * even when users don't have the app open.
 */
export async function syncNotificationsForAllUsers(): Promise<{
  totalUsers: number;
  results: Array<{ userId: string; role: string; result: SyncResult }>;
}> {
  const users = await prisma.user.findMany({
    select: { id: true, role: true }
  });

  const results: Array<{ userId: string; role: string; result: SyncResult }> = [];

  // Process users sequentially to avoid overwhelming the DB
  for (const user of users) {
    try {
      const result = await syncNotificationsForUser(user.id, user.role, true);
      results.push({ userId: user.id, role: user.role, result });
    } catch (err) {
      console.error(`Sync failed for user ${user.id}:`, err);
      results.push({
        userId: user.id,
        role: user.role,
        result: { created: 0, dismissed: 0, deleted: 0, pushed: 0 }
      });
    }
  }

  return { totalUsers: users.length, results };
}
