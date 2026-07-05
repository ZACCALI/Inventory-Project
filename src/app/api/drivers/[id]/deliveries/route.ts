import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'delivery');
    if (error) return error;

    const { id } = await params;

    const deliveries = await prisma.delivery.findMany({
      where: { driverId: id },
      include: {
        order: {
          include: {
            customer: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(deliveries);
  } catch (error) {
    console.error('Driver Deliveries GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch driver deliveries' }, { status: 500 });
  }
}
