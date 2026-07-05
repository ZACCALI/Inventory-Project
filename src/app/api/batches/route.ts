import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    const batches = await prisma.batch.findMany({
      where: productId ? {
        productId,
        stock: { gt: 0 },
        expiryDate: { not: null },
        product: { isArchived: false }
      } : {
        stock: { gt: 0 },
        expiryDate: { not: null },
        product: { isArchived: false }
      },
      include: {
        product: {
          include: {
            category: true,
            uoms: true
          }
        }
      },
      orderBy: { expiryDate: 'asc' },
    });

    return NextResponse.json(batches);
  } catch (error) {
    console.error('Failed to fetch batches:', error);
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 });
  }
}
