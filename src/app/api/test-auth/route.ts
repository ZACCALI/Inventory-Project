import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';

export async function GET() {
  try {
    const res = await requireAuth();
    if (res.error) return res.error;
    return NextResponse.json({ ok: true, user: res.user });
  } catch (err: unknown) {
    console.log('Uncaught Error in API Route:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
