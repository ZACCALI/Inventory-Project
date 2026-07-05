import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { syncNotificationsForUser } from '@/lib/notificationSync';

export const dynamic = 'force-dynamic';

const lastSyncMap = new Map<string, number>();

export async function GET() {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const now = Date.now();
    const lastSync = lastSyncMap.get(user.id) || 0;
    
    // Throttle to prevent concurrent or duplicate syncs (e.g., from React StrictMode)
    if (now - lastSync < 5000) {
      return NextResponse.json({ success: true, skipped: true, reason: 'throttled' });
    }
    
    lastSyncMap.set(user.id, now);

    const result = await syncNotificationsForUser(user.id, user.role, true);

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error';
    console.error('Notification Sync Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

