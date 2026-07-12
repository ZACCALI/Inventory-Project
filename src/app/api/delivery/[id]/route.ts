import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { updateDeliverySchema } from '@/lib/validations';
import { checkAndSetIdempotency } from '@/lib/idempotency';
import { Prisma } from '@prisma/client';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requirePermission(request, 'delivery');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    const isDuplicate = await checkAndSetIdempotency(body.idempotencyKey);
    if (isDuplicate) {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    const parsed = updateDeliverySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { status, driverId, driverName, driverPhone, proofPhoto, deliveredAt } = parsed.data;
    const isOfflineSync = !!body.isOfflineSync;

    const updateData: Prisma.DeliveryUpdateInput = {};
    if (status !== undefined) updateData.status = status;
    if (driverId !== undefined) {
      updateData.driver = driverId ? { connect: { id: driverId } } : { disconnect: true };
    }
    if (driverName !== undefined) updateData.driverName = driverName;
    if (driverPhone !== undefined) updateData.driverPhone = driverPhone;
    if (proofPhoto !== undefined) updateData.proofPhoto = proofPhoto;
    if (deliveredAt !== undefined) updateData.deliveredAt = deliveredAt;

    const delivery = await prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.update({
        where: { id },
        data: updateData,
      });

      // Auto-sync parent Order status
      if (status === 'delivered') {
        await tx.order.update({
          where: { id: updated.orderId },
          data: { status: 'delivered' }
        });
      } else if (status && ['pending', 'in_transit', 'failed', 'cancelled'].includes(status)) {
        // If delivery is reverted or fails, lock the parent order to 'confirmed'
        // This ensures the order doesn't stay 'delivered' falsely, but doesn't auto-cancel
        // to keep the inventory safely reserved until manual cancellation.
        await tx.order.update({
          where: { id: updated.orderId },
          data: { status: 'confirmed' }
        });
      }

      await tx.auditLog.create({
        data: { userId: user.id, action: 'UPDATE', entity: 'Delivery', details: `Updated delivery ${id} status to ${status || 'modified'}`, mode: isOfflineSync ? 'offline' : 'online' }
      });

      return updated;
    });

    return NextResponse.json(delivery);
  } catch (error) {
    console.error('Failed to update delivery:', error);
    return NextResponse.json({ error: 'Failed to update delivery' }, { status: 500 });
  }
}

