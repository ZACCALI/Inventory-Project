import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { z } from 'zod';

const updateBatchSchema = z.object({
  expiryDate: z.string().trim().max(100).optional().or(z.literal('')).or(z.null()),
  batchNumber: z.string().trim().max(100).optional().or(z.literal('')).or(z.null()),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    const parsed = updateBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { expiryDate, batchNumber } = parsed.data;

    const batch = await prisma.batch.findUnique({ where: { id }, include: { product: true } });
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const updatedBatch = await prisma.batch.update({
      where: { id },
      data: {
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        batchNumber: batchNumber !== undefined ? batchNumber : undefined,
      },
    });

    // We also want to check if this is the earliest batch, and update the Product's expiryDate if so.
    const earliestBatch = await prisma.batch.findFirst({
      where: { productId: batch.productId, stock: { gt: 0 }, expiryDate: { not: null } },
      orderBy: { expiryDate: 'asc' }
    });

    await prisma.product.update({
      where: { id: batch.productId },
      data: { expiryDate: earliestBatch ? earliestBatch.expiryDate : null }
    });

    // Audit log for batch expiry update
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'Batch',
        details: `Updated expiry date for batch ${batch.batchNumber || batch.id} of ${batch.product.name} to ${expiryDate || 'none'}`,
      }
    });

    return NextResponse.json(updatedBatch);
  } catch (error: unknown) {
    console.error('Failed to update batch:', error);
    return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 });
  }
}
