import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';
import { updateOrderSchema } from '@/lib/validations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreBatchStock(tx: any, productId: string, quantityToRestore: number) {
  const batch = await tx.batch.findFirst({
    where: { productId: productId },
    orderBy: [{ expiryDate: 'desc' }, { createdAt: 'desc' }]
  });
  if (batch) {
    await tx.batch.update({
      where: { id: batch.id },
      data: { stock: { increment: quantityToRestore } }
    });
  } else {
    await tx.batch.create({
      data: { productId: productId, initialQty: quantityToRestore, stock: quantityToRestore }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deductBatchStock(tx: any, productId: string, quantityToDeduct: number) {
  const availableBatches = await tx.batch.findMany({ where: { productId: productId, stock: { gt: 0 } } });
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  availableBatches.sort((a: any, b: any) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime();
    if (a.expiryDate && !b.expiryDate) return -1;
    if (!a.expiryDate && b.expiryDate) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  let remaining = quantityToDeduct;
  for (const b of availableBatches) {
    if (remaining <= 0) break;
    const deduct = Math.min(b.stock, remaining);
    remaining -= deduct;
    await tx.batch.update({ where: { id: b.id }, data: { stock: b.stock - deduct } });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'orders');
    if (error) return error;

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: true } }, delivery: true, createdBy: { select: { id: true, name: true, email: true, role: true } } },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json(order);
  } catch (error) {
    console.error('Order GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'orders');
    if (error) return error;

    const { id } = await params;
    const bodyRaw = await request.json();

    // Validate input with Zod schema
    const parsed = updateOrderSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { status, paymentStatus, notes, items: parsedItems, discount, isArchived, deliveryDriverName, deliveryDate } = parsed.data;
    const sanitizedDiscount = discount !== undefined ? Math.max(0, Math.abs(Number(discount) || 0)) : undefined;
    const body = { status, paymentStatus, notes, items: parsedItems, discount: sanitizedDiscount, isArchived, deliveryDriverName, deliveryDate };

    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({ where: { id }, include: { items: true, delivery: true } });
      if (!existingOrder) throw new Error('Order not found');

      const isDelivery = existingOrder.delivery && (!Array.isArray(existingOrder.delivery) || existingOrder.delivery.length > 0);
      const orderPrefix = existingOrder.orderType === 'pos' ? 'Store' : (isDelivery ? 'Delivery' : 'Walk in');
      const logSource = existingOrder.orderType === 'pos' ? 'WALK_IN_STORE' : (isDelivery ? 'DELIVERY' : 'WALK_IN_HOME');

      // LOCK: Prevent any changes to cancelled orders (fixes cancel/un-cancel spam bug)
      if (existingOrder.status === 'cancelled' && (body.status !== 'cancelled' || body.items)) {
        throw new Error('This order has been cancelled and cannot be modified. Please create a new order instead.');
      }

      // Prevent reverting Delivered status back to lower statuses
      if (existingOrder.status === 'delivered' && body.status && ['pending', 'confirmed'].includes(body.status)) {
        throw new Error('A delivered order cannot be reverted back to pending or confirmed. (Inconsistency protection)');
      }

      // Prevent item editing on confirmed or delivered orders (staff only — admins can override)
      const effectiveStatus = body.status || existingOrder.status;
      if (['confirmed', 'delivered'].includes(effectiveStatus) && body.items && user.role !== 'admin') {
        throw new Error('Cannot edit items on a ' + effectiveStatus + ' order. Only pending orders can have their items modified.');
      }

      // 1. Handle Item Editing (if body.items is provided)
      let calculatedTotal = undefined;
      
      if (body.items && Array.isArray(body.items)) {
        // If order is already cancelled, we shouldn't adjust stock for item changes, because stock was already restored.
        // But if they are editing a non-cancelled order, we reconcile stock.
        if (existingOrder.status !== 'cancelled') {
          // Use composite key (productId + uomName + multiplier) to correctly handle
          // the same product appearing in multiple UOMs (e.g., BOX ×10 and BASE ×1)
          const makeKey = (productId: string, uomName: string | null | undefined, multiplier: number | null | undefined) => 
            `${productId}::${uomName || 'BASE'}::${multiplier || 1}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newItemsMap = new Map(body.items.map((i: any) => [
            makeKey(i.productId, i.uomName, i.multiplier), i
          ]));
          const oldItemsMap = new Map(existingOrder.items.map(i => [
            makeKey(i.productId, i.uomName, i.multiplier), i
          ]));

          // Handle Removals and Modifications
          for (const [key, oldItem] of oldItemsMap) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newItem = newItemsMap.get(key) as any;
            if (!newItem) {
              // REMOVED - Restore stock
              const restoreQty = oldItem.quantity * (oldItem.multiplier || 1);
              await restoreBatchStock(tx, oldItem.productId, restoreQty);
              await tx.product.update({ where: { id: oldItem.productId }, data: { stock: { increment: restoreQty } } });
              await tx.stockLog.create({ data: { type: 'IN', quantity: restoreQty, reason: `${orderPrefix} (Item Removed from Order #${existingOrder.orderNumber.split('-').pop()})`, source: logSource, productId: oldItem.productId, userId: user.id } });
            } else {
              // MODIFIED - Only adjust the delta
              const oldMultiplier = oldItem.multiplier || 1;
              const newMultiplier = newItem.multiplier || oldMultiplier;
              const oldBaseQty = oldItem.quantity * oldMultiplier;
              const newBaseQty = newItem.qty * newMultiplier;
              const qtyDiff = newBaseQty - oldBaseQty;
              if (qtyDiff > 0) {
                // Increased quantity - Deduct stock
                await deductBatchStock(tx, oldItem.productId, qtyDiff);
                await tx.product.update({ where: { id: oldItem.productId }, data: { stock: { decrement: qtyDiff } } });
                await tx.stockLog.create({ data: { type: 'OUT', quantity: qtyDiff, reason: `${orderPrefix} (Quantity Increased on Order #${existingOrder.orderNumber.split('-').pop()})`, source: logSource, productId: oldItem.productId, userId: user.id } });
              } else if (qtyDiff < 0) {
                // Decreased quantity - Restore stock
                const absDiff = Math.abs(qtyDiff);
                await restoreBatchStock(tx, oldItem.productId, absDiff);
                await tx.product.update({ where: { id: oldItem.productId }, data: { stock: { increment: absDiff } } });
                await tx.stockLog.create({ data: { type: 'IN', quantity: absDiff, reason: `${orderPrefix} (Quantity Decreased on Order #${existingOrder.orderNumber.split('-').pop()})`, source: logSource, productId: oldItem.productId, userId: user.id } });
              }
              // If qtyDiff === 0, this item was not changed, so do nothing
            }
          }

          // Handle Additions (new items that didn't exist before)
          for (const [key, newItem] of newItemsMap) {
            if (!oldItemsMap.has(key)) {
              // ADDED - Deduct stock
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              const addedBaseQty = (newItem as any).qty * ((newItem as any).multiplier || 1);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              await deductBatchStock(tx, (newItem as any).productId, addedBaseQty);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              await tx.product.update({ where: { id: (newItem as any).productId }, data: { stock: { decrement: addedBaseQty } } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              await tx.stockLog.create({ data: { type: 'OUT', quantity: addedBaseQty, reason: `${orderPrefix} (Item Added to Order #${existingOrder.orderNumber.split('-').pop()})`, source: logSource, productId: (newItem as any).productId, userId: user.id } });
            }
          }
        }
        
        // Calculate new total
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subtotal = body.items.reduce((sum: number, i: any) => sum + (i.qty * i.price), 0);
        calculatedTotal = Math.max(0, subtotal - (body.discount || existingOrder.discount || 0));

        // Delete old items and create new ones (simplest way to replace the relationship)
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
// eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: body.items.map((i: any) => ({
            orderId: id,
            productId: i.productId,
            quantity: i.qty,
            price: i.price,
            subtotal: i.qty * i.price,
            uomName: i.uomName || null,
            multiplier: i.multiplier ? parseInt(i.multiplier) : 1
          }))
        });
      }
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {
        status: body.status !== undefined ? body.status : existingOrder.status,
        paymentStatus: body.paymentStatus !== undefined ? body.paymentStatus : existingOrder.paymentStatus,
        notes: body.notes !== undefined ? body.notes : existingOrder.notes,
      };

      if (body.isArchived !== undefined) updateData.isArchived = body.isArchived;
      if (body.discount !== undefined) updateData.discount = body.discount || 0;
      if (calculatedTotal !== undefined) updateData.totalAmount = calculatedTotal;

      const updatedOrder = await tx.order.update({
        where: { id },
        data: updateData,
        include: { customer: true, items: { include: { product: true } }, delivery: true },
      });

      // Update Delivery if provided
      if (body.deliveryDriverName !== undefined || body.deliveryDate !== undefined) {
        const existingDelivery = await tx.delivery.findUnique({ where: { orderId: id } });
        if (existingDelivery) {
          await tx.delivery.update({
            where: { orderId: id },
            data: {
              driverName: body.deliveryDriverName !== undefined ? (body.deliveryDriverName || null) : existingDelivery.driverName,
              scheduledDate: body.deliveryDate ? new Date(body.deliveryDate) : existingDelivery.scheduledDate,
            }
          });
        } else if (body.deliveryDriverName || body.deliveryDate) {
          await tx.delivery.create({
            data: {
              orderId: id,
              driverName: body.deliveryDriverName || null,
              scheduledDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
              status: 'pending'
            }
          });
        }
      }

      // If cancelled, restore stock (only if we didn't just calculate items)
      if (existingOrder.status !== 'cancelled' && body.status === 'cancelled') {
        const settings = await tx.systemSettings.findUnique({ where: { id: "1" } });
        if (settings?.lockOrderCancel && user.role !== 'admin') {
          throw new Error('Only admins can cancel orders.');
        }
        const itemsToRestore = updatedOrder.items;
        for (const item of itemsToRestore) {
          const cancelRestoreQty = item.quantity * (item.multiplier || 1);
          await restoreBatchStock(tx, item.productId, cancelRestoreQty);
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: cancelRestoreQty } },
          });
          await tx.stockLog.create({
            data: {
              type: 'IN',
              quantity: cancelRestoreQty,
              reason: `${orderPrefix} (Cancelled Order #${existingOrder.orderNumber.split('-').pop()})`,
              source: logSource,
              productId: item.productId,
              userId: user.id,
            }
          });
        }
        
        // Cancel associated delivery if exists
        const delivery = await tx.delivery.findFirst({ where: { orderId: id } });
        if (delivery && delivery.status !== 'delivered') {
          await tx.delivery.update({
            where: { id: delivery.id },
            data: { status: 'cancelled' }
          });
        }
      }

      // Sync Delivery status if Order status changes to delivered
      if (existingOrder.status !== 'delivered' && body.status === 'delivered') {
        const delivery = await tx.delivery.findFirst({ where: { orderId: id } });
        if (delivery && delivery.status !== 'delivered') {
          await tx.delivery.update({
            where: { id: delivery.id },
            data: { status: 'delivered' }
          });
        }
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE',
          entity: 'Order',
          details: `Updated order ${updatedOrder.orderNumber} ${body.items ? 'Items & Details' : 'Status'}`,
          mode: bodyRaw.isOfflineSync ? 'offline' : 'online',
        }
      });

      return updatedOrder;
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json(order);
  } catch (error: unknown) {
    console.error('Order PUT error:', error);
    const statusCode = (error as Error).message?.includes('not found') ? 404 : (error as Error).message?.includes('denied') || (error as Error).message?.includes('Only admins') ? 403 : (error as Error).message?.includes('cancelled') || (error as Error).message?.includes('Cannot edit') || (error as Error).message?.includes('Insufficient') || (error as Error).message?.includes('Discount too high') ? 400 : 500;
    return NextResponse.json({ error: (error as Error).message || 'Failed to update order' }, { status: statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error: authError } = await requirePermission(request, 'orders');
    if (authError) return authError;

    const { id } = await params;

    const settings = await prisma.systemSettings.findUnique({ where: { id: "1" } });
    if (settings?.lockOrderDelete && user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete/archive orders.' }, { status: 403 });
    }

    let isOfflineSync = false;
    try { const delBody = await request.clone().json(); isOfflineSync = !!delBody?.isOfflineSync; } catch {}

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) throw new Error('Order not found');

      // No stock restoration on archive since it's just soft delete.
      // If user wants to restore stock, they should Cancel the order first.
      await tx.order.update({
        where: { id },
        data: { isArchived: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE',
          entity: order.orderType === 'pos' ? 'Order (POS)' : 'Order (Wholesale)',
          details: `Archived Order ${order.orderNumber}`,
          mode: isOfflineSync ? 'offline' : 'online',
        }
      });
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ message: 'Order archived successfully' });
  } catch (error) {
    console.error('Order DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
  }
}

