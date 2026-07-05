import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Subscribe to push notifications
export async function POST(req: Request) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { subscription } = body as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    // Upsert subscription (update if endpoint already exists)
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userId: user.id
      },
      create: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error';
    console.error('Push subscription error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Unsubscribe from push notifications
export async function DELETE(req: Request) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { endpoint } = body as { endpoint?: string };

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: user.id }
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error';
    console.error('Push unsubscription error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
