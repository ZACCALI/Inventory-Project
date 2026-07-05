import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    // Fetch all non-dismissed notifications for this user
    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        isDismissed: false
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to 50 recent
    });

    return NextResponse.json(notifications);
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error';
    console.error('Failed to fetch notifications:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    // Safely parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action, notificationId } = body as { action?: string; notificationId?: string };

    if (action === 'mark_all_read') {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'mark_read') {
      if (!notificationId || typeof notificationId !== 'string') {
        return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });
      }
      await prisma.notification.updateMany({
        where: { id: notificationId, userId: user.id },
        data: { isRead: true }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'dismiss') {
      if (!notificationId || typeof notificationId !== 'string') {
        return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });
      }
      // Ensure the notification belongs to the user
      await prisma.notification.updateMany({
        where: { id: notificationId, userId: user.id },
        data: { isDismissed: true, isRead: true }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'dismiss_all') {
      await prisma.notification.updateMany({
        where: { userId: user.id, isDismissed: false },
        data: { isDismissed: true, isRead: true }
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error';
    console.error('Failed to update notifications:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
