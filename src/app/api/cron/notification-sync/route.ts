import { NextResponse } from 'next/server';
import { syncNotificationsForAllUsers } from '@/lib/notificationSync';

export const dynamic = 'force-dynamic';

/**
 * Cron endpoint for background notification sync.
 * Runs the sync for ALL users and sends push notifications,
 * even when users don't have the app open.
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 *
 * Usage:
 * - Vercel Cron: Add to vercel.json crons config
 * - Windows Task Scheduler: curl http://localhost:3000/api/cron/notification-sync -H "Authorization: Bearer YOUR_CRON_SECRET"
 * - External cron: Any HTTP client can trigger this endpoint
 *
 * Recommended interval: every 5 minutes
 */
export async function GET(req: Request) {
  try {
    // ── Authenticate via CRON_SECRET ────────────────────────────
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const authHeader = req.headers.get('authorization');
      const providedSecret = authHeader?.replace('Bearer ', '');

      if (providedSecret !== cronSecret) {
        return NextResponse.json(
          { error: 'Unauthorized. Invalid or missing CRON_SECRET.' },
          { status: 401 }
        );
      }
    } else {
      // If CRON_SECRET is not set, only allow from localhost
      const forwarded = req.headers.get('x-forwarded-for');
      const host = req.headers.get('host') || '';
      const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
      const isLocalIp = !forwarded || forwarded === '127.0.0.1' || forwarded === '::1';

      if (!isLocalhost && !isLocalIp) {
        return NextResponse.json(
          { error: 'Unauthorized. Set CRON_SECRET in .env to enable remote access.' },
          { status: 401 }
        );
      }
    }

    // ── Run sync for all users ──────────────────────────────────
    const { totalUsers, results } = await syncNotificationsForAllUsers();

    const totalCreated = results.reduce((sum, r) => sum + r.result.created, 0);
    const totalPushed = results.reduce((sum, r) => sum + r.result.pushed, 0);
    const totalDismissed = results.reduce((sum, r) => sum + r.result.dismissed, 0);
    const totalDeleted = results.reduce((sum, r) => sum + r.result.deleted, 0);

    return NextResponse.json({
      success: true,
      summary: {
        usersProcessed: totalUsers,
        notificationsCreated: totalCreated,
        pushNotificationsSent: totalPushed,
        staleDismissed: totalDismissed,
        staleDeleted: totalDeleted
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error';
    console.error('Cron Notification Sync Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
