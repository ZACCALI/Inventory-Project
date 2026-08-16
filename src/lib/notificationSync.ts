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
  sendPush: boolean = true,
  prefetchedData?: {
    lowStockProducts?: unknown[];
    expiringBatches?: unknown[];
    pendingDeliveries?: unknown[];
  }
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, dismissed: 0, deleted: 0, pushed: 0 };
  const allowedTypes = getAllowedTypes(userRole);

  const settings = await prisma.systemSettings.findFirst() || { expiryWarningDays: 30 };

  // ── 1. Low Stock Detection ──────────────────────────────────
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let lowStockProducts: any[] = [];
  if (allowedTypes.includes('low_stock')) {
    if (prefetchedData?.lowStockProducts) {
      lowStockProducts = prefetchedData.lowStockProducts;
    } else {
      const allProducts = await prisma.product.findMany({
        where: { isArchived: false }
      });
      lowStockProducts = allProducts.filter(p => p.stock <= p.minStock);
    }
  }

  // ── 2. Expiry Detection ─────────────────────────────────────
  const today = new Date();
  let expiringBatches: any[] = [];
  if (allowedTypes.includes('expiry')) {
    if (prefetchedData?.expiringBatches) {
      expiringBatches = prefetchedData.expiringBatches;
    } else {
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
  }

  // ── 3. Pending Deliveries Detection ─────────────────────────
  let pendingDeliveries: any[] = [];
  if (allowedTypes.includes('delivery')) {
    if (prefetchedData?.pendingDeliveries) {
      pendingDeliveries = prefetchedData.pendingDeliveries;
    } else {
      pendingDeliveries = await prisma.delivery.findMany({
        where: { status: 'pending' },
        include: { order: true }
      });
    }
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

  // Low Stock alerts (Hybrid Smart Rollup: <=3 itemized, >3 summary)
  if (lowStockProducts.length > 0 && lowStockProducts.length <= 3) {
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
  } else if (lowStockProducts.length > 3) {
    const key = 'low_stock::summary';
    if (!existingKeys.has(key)) {
      const sample = lowStockProducts.slice(0, 2);
      const sampleNames = sample.map(p => p.name).join(', ');
      const remainingCount = lowStockProducts.length - sample.length;
      toCreate.push({
        userId,
        type: 'low_stock',
        title: `${lowStockProducts.length} Products Low on Stock`,
        message: `${lowStockProducts.length} products (including ${sampleNames}${remainingCount > 0 ? `, and ${remainingCount} others` : ''}) have fallen below minimum threshold.`,
        link: '/inventory?filter=low_stock',
        referenceId: 'summary'
      });
    }
  }

  // Expiry alerts (Hybrid Smart Rollup: <=3 itemized, >3 summary)
  if (expiringBatches.length > 0 && expiringBatches.length <= 3) {
    for (const batch of expiringBatches) {
      if (!batch.expiryDate) continue;
      const daysLeft = Math.ceil((new Date(batch.expiryDate).getTime() - today.getTime()) / (1000 * 3600 * 24));
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
  } else if (expiringBatches.length > 3) {
    const key = 'expiry::summary';
    if (!existingKeys.has(key)) {
      const sample = expiringBatches.slice(0, 2);
      const sampleBatches = sample.map(b => b.product?.name || b.batchNumber).join(', ');
      const remainingCount = expiringBatches.length - sample.length;
      toCreate.push({
        userId,
        type: 'expiry',
        title: `${expiringBatches.length} Batches Expiring Soon`,
        message: `${expiringBatches.length} batches (including ${sampleBatches}${remainingCount > 0 ? `, and ${remainingCount} others` : ''}) are expiring within the next ${settings.expiryWarningDays} days.`,
        link: '/inventory/expiry',
        referenceId: 'summary'
      });
    }
  }

  // Pending Delivery alerts (Hybrid Smart Rollup: <=5 itemized, >5 summary)
  if (pendingDeliveries.length > 0 && pendingDeliveries.length <= 5) {
    for (const delivery of pendingDeliveries) {
      const key = `delivery::${delivery.id}`;
      if (!existingKeys.has(key)) {
        toCreate.push({
          userId,
          type: 'delivery',
          title: 'Pending Delivery',
          message: `Order #${delivery.order?.orderNumber || delivery.orderNumber} is pending delivery.`,
          link: `/orders`,
          referenceId: delivery.id
        });
      }
    }
  } else if (pendingDeliveries.length > 5) {
    const key = 'delivery::summary';
    if (!existingKeys.has(key)) {
      const sample = pendingDeliveries.slice(0, 2);
      const sampleOrders = sample.map(d => d.order?.orderNumber || d.orderNumber || d.id).join(', #');
      const remainingCount = pendingDeliveries.length - sample.length;
      toCreate.push({
        userId,
        type: 'delivery',
        title: `${pendingDeliveries.length} Orders Pending Delivery`,
        message: `${pendingDeliveries.length} orders (including #${sampleOrders}${remainingCount > 0 ? `, and ${remainingCount} others` : ''}) are pending dispatch and delivery.`,
        link: `/orders`,
        referenceId: 'summary'
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

    if (n.type === 'low_stock') {
      if (n.referenceId === 'summary') {
        return lowStockProducts.length <= 3;
      }
      return !activeProductIds.has(n.referenceId) || lowStockProducts.length > 3;
    }

    if (n.type === 'expiry') {
      if (n.referenceId === 'summary') {
        return expiringBatches.length <= 3;
      }
      return !activeBatchIds.has(n.referenceId) || expiringBatches.length > 3;
    }

    if (n.type === 'delivery') {
      if (n.referenceId === 'summary') {
        return pendingDeliveries.length <= 5;
      }
      return !activeDeliveryIds.has(n.referenceId) || pendingDeliveries.length > 5;
    }

    return false;
  });

  // Split stale into: dismissed (DELETE) vs active (DISMISS)
  const staleDismissedIds = staleNotifications
    .filter(n => n.isDismissed)
    .map(n => n.id);

  const staleActiveIds = staleNotifications
    .filter(n => !n.isDismissed)
    .map(n => n.id);

  // ── Execute DB writes in a single transaction ─────────────────
  await prisma.$transaction(async (tx) => {
    // Create new notifications
    if (toCreate.length > 0) {
      await tx.notification.createMany({ data: toCreate });
      result.created = toCreate.length;
    }

    // Dismiss stale active notifications
    if (staleActiveIds.length > 0) {
      const dismissed = await tx.notification.updateMany({
        where: {
          id: { in: staleActiveIds },
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

  // ── Send push notifications (fire-and-forget, throttled to max 1 per type) ──
  if (sendPush && toCreate.length > 0) {
    try {
      const notificationsByType = new Map<string, NewNotification[]>();
      for (const notif of toCreate) {
        const list = notificationsByType.get(notif.type) || [];
        list.push(notif);
        notificationsByType.set(notif.type, list);
      }

      const pushesToSend = Array.from(notificationsByType.values()).map(notifs => {
        if (notifs.length === 1) {
          return {
            title: notifs[0].title,
            message: notifs[0].message,
            link: notifs[0].link,
            type: notifs[0].type
          };
        }
        const first = notifs[0];
        if (first.type === 'low_stock') {
          return {
            title: `${notifs.length} Products Low on Stock`,
            message: `${notifs.length} products have fallen below minimum threshold.`,
            link: '/inventory?filter=low_stock',
            type: first.type
          };
        }
        if (first.type === 'expiry') {
          return {
            title: `${notifs.length} Batches Expiring Soon`,
            message: `${notifs.length} batches are expiring within the next ${settings.expiryWarningDays} days.`,
            link: '/inventory/expiry',
            type: first.type
          };
        }
        if (first.type === 'delivery') {
          return {
            title: `${notifs.length} Orders Pending Delivery`,
            message: `${notifs.length} orders are pending dispatch and delivery.`,
            link: '/orders',
            type: first.type
          };
        }
        return {
          title: first.title,
          message: `${first.message} (+${notifs.length - 1} more)`,
          link: first.link,
          type: first.type
        };
      });

      const pushResults = await Promise.allSettled(
        pushesToSend.map(push =>
          sendPushToUser(userId, {
            title: push.title,
            message: push.message,
            link: push.link,
            type: push.type
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

  const settings = await prisma.systemSettings.findFirst() || { expiryWarningDays: 30 };

  const today = new Date();
  const expiryThreshold = new Date();
  expiryThreshold.setDate(today.getDate() + settings.expiryWarningDays);

  const [allProducts, expiringBatches, pendingDeliveries] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false }
    }),
    prisma.batch.findMany({
      where: {
        expiryDate: { lte: expiryThreshold },
        stock: { gt: 0 }
      },
      include: { product: true }
    }),
    prisma.delivery.findMany({
      where: { status: 'pending' },
      include: { order: true }
    })
  ]);

  const lowStockProducts = allProducts.filter(p => p.stock <= p.minStock);

  const prefetchedData = {
    lowStockProducts,
    expiringBatches,
    pendingDeliveries
  };

  const results: Array<{ userId: string; role: string; result: SyncResult }> = [];

  for (const user of users) {
    try {
      const result = await syncNotificationsForUser(user.id, user.role, true, prefetchedData);
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
