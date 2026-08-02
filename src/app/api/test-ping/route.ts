import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';

export async function GET() {
  try {
    const { error } = await requireAuth();
    if (error) return error;
    return NextResponse.json({ ok: true, timestamp: Date.now() });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
