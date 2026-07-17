import webpush from 'web-push';
import prisma from '@/lib/prisma';

// Configure VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@amroding.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  message: string;
  icon?: string;
  link?: string;
  type?: string;
}

/**
 * Send push notification to all subscribed devices for a user.
 * Automatically cleans up invalid/expired subscriptions.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('Push notifications not configured: VAPID keys missing');
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId }
  });

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.message,
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: {
      url: payload.link || '/dashboard',
      type: payload.type || 'system'
    }
  });

  const expiredSubscriptionIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          pushPayload
        );
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        // 404 or 410 means subscription is no longer valid
        if (error.statusCode === 404 || error.statusCode === 410) {
          expiredSubscriptionIds.push(sub.id);
        } else {
          console.error(`Push failed for subscription ${sub.id}:`, err);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredSubscriptionIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: expiredSubscriptionIds } }
    });
    console.log(`Cleaned up ${expiredSubscriptionIds.length} expired push subscriptions`);
  }
}

/**
 * Send push notification to all users with active subscriptions.
 * Useful for broadcast alerts.
 */
export async function sendPushToAllUsers(payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const userIds = await prisma.pushSubscription.findMany({
    select: { userId: true },
    distinct: ['userId']
  });

  await Promise.allSettled(
    userIds.map((u) => sendPushToUser(u.userId, payload))
  );
}
