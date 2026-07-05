import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const search = request.nextUrl.searchParams.get('search') || '';
    const actionFilter = request.nextUrl.searchParams.get('action') || '';
    const entityFilter = request.nextUrl.searchParams.get('entity') || '';
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const skip = (page - 1) * limit;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    
    // Non-admin users can only see their own logs
    if (user.role !== 'admin') {
      where.userId = user.id;
    }
    
    if (search) {
      where.OR = [
        { details: { contains: search } },
        { user: { name: { contains: search } } }
      ];
    }
    
    if (actionFilter && actionFilter !== 'All') {
      where.action = actionFilter;
    }
    
    if (entityFilter && entityFilter !== 'All') {
      where.entity = { startsWith: entityFilter };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json(logs, {
      headers: { 'X-Total-Count': total.toString() },
    });
  } catch (error) {
    console.error('History API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch history logs' }, { status: 500 });
  }
}
