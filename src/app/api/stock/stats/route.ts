import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const timeframe = request.nextUrl.searchParams.get('timeframe') || 'today';
    
    let dateFilter = {};
    const now = new Date();
    
    if (timeframe === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFilter = { gte: startOfDay };
    } else if (timeframe === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      dateFilter = { gte: startOfWeek };
    } else if (timeframe === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { gte: startOfMonth };
    } else if (timeframe === 'year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      dateFilter = { gte: startOfYear };
    }

    const whereCondition = timeframe === 'all' ? {} : { createdAt: dateFilter };

    const [inStats, outStats, totalMovements] = await Promise.all([
      prisma.stockLog.aggregate({
        _sum: { quantity: true },
        where: { ...whereCondition, type: 'IN', isVoided: false }
      }),
      prisma.stockLog.aggregate({
        _sum: { quantity: true },
        where: { ...whereCondition, type: 'OUT', isVoided: false }
      }),
      prisma.stockLog.count({
        where: { ...whereCondition, isVoided: false }
      })
    ]);

    return NextResponse.json({
      totalIn: inStats._sum.quantity || 0,
      totalOut: outStats._sum.quantity || 0,
      logCount: totalMovements
    });
  } catch (error) {
    console.error('Failed to fetch stock stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
