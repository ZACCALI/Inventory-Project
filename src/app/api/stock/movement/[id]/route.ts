import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission, requireAdmin } from '@/lib/apiAuth';
import { updateStockMovementSchema } from '@/lib/validations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreBatchStock(tx: any, productId: string, quantityToRestore: number) {
  if (quantityToRestore <= 0) return;
  const batch = await tx.batch.findFirst({
    where: { productId: productId },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }]
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authErr } = await requirePermission(request, 'inventory');
    if (authErr) return authErr;

    // Strict Admin Enforcement
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Only Admins can edit stock logs.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validate input with Zod schema
    const parsed = updateStockMovementSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { quantity, reason, expiryDate } = parsed.data;
    const userId = user.id;

    const log = await prisma.stockLog.findUnique({ where: { id }, include: { product: true } });
    if (!log) {
      return NextResponse.json({ error: 'Stock log not found' }, { status: 404 });
    }

    const qtyDiff = quantity - log.quantity;

    let newStock = log.product.stock;
    if (log.type === 'IN') {
      newStock += qtyDiff;
    } else {
      newStock -= qtyDiff;
    }

    if (newStock < 0) {
      if (log.type === 'IN') {
        return NextResponse.json({ 
          error: `Cannot reduce receive quantity by ${Math.abs(qtyDiff)}. Current stock is only ${log.product.stock}.` 
        }, { status: 400 });
      } else {
        const maxIssue = log.product.stock + log.quantity;
        return NextResponse.json({ 
          error: `Cannot issue ${quantity} items. Current stock is ${log.product.stock} (Max allowed issue is ${maxIssue}).` 
        }, { status: 400 });
      }
    }

    // Additional validation: Don't allow reducing IN log below what has already been issued from its batch
    if (log.type === 'IN' && log.batchId && qtyDiff < 0) {
      const batch = await prisma.batch.findUnique({ where: { id: log.batchId } });
      if (batch && Math.abs(qtyDiff) > batch.stock) {
        return NextResponse.json({ 
          error: `Cannot reduce receive quantity by ${Math.abs(qtyDiff)}. This stock has already been issued to orders (Remaining batch stock: ${batch.stock}).` 
        }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.stockLog.update({
        where: { id },
        data: { 
          quantity, 
          reason
        }
      });

      await tx.product.update({
        where: { id: log.productId },
        data: { stock: newStock }
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Stock Movement',
          details: `Edited Stock ${log.type} log (ID: ${id}) to quantity ${quantity} for ${log.product.name} (Ref: ${reason}). Old quantity was ${log.quantity}.`,
        }
      });

      if (log.type === 'IN' && log.batchId) {
        const batch = await tx.batch.findUnique({ where: { id: log.batchId } });
        if (batch) {
          const newBatchStock = batch.stock + qtyDiff;
          const newInitialQty = batch.initialQty + qtyDiff;
          
          await tx.batch.update({
            where: { id: log.batchId },
            data: { 
              stock: newBatchStock, 
              initialQty: newInitialQty,
              ...(expiryDate && { expiryDate: new Date(expiryDate) })
            }
          });
        }
      } else if (log.type === 'OUT') {
        if (qtyDiff > 0) {
          // Increased OUT quantity = more stock deducted
          await deductBatchStock(tx, log.productId, qtyDiff);
        } else if (qtyDiff < 0) {
          // Decreased OUT quantity = stock restored
          await restoreBatchStock(tx, log.productId, Math.abs(qtyDiff));
        }
      }

      return log;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Failed to update stock log:', error);
    return NextResponse.json({ error: 'Failed to update stock log' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authErr } = await requireAdmin(request);
    if (authErr) return authErr;

    const { id } = await params;

    const log = await prisma.stockLog.findUnique({ where: { id }, include: { product: true } });
    if (!log) {
      return NextResponse.json({ error: 'Stock log not found' }, { status: 404 });
    }

    if (log.isVoided) {
      return NextResponse.json({ error: 'This stock log is already voided' }, { status: 400 });
    }

    if (['WALK_IN_HOME', 'WALK_IN_STORE', 'DELIVERY'].includes(log.source)) {
      return NextResponse.json({ error: 'System-generated logs cannot be voided directly. Please cancel the original transaction instead.' }, { status: 400 });
    }

    let newStock = log.product.stock;
    if (log.type === 'IN') {
      newStock -= log.quantity;
    } else {
      newStock += log.quantity;
    }

    if (newStock < 0) {
      return NextResponse.json({ error: 'Deletion would result in negative stock' }, { status: 400 });
    }
    
    let expiryDateUpdate = {};
    if (log.batchId) {
      const earliestBatch = await prisma.batch.findFirst({
        where: { productId: log.productId, id: { not: log.batchId }, stock: { gt: 0 }, expiryDate: { not: null } },
        orderBy: { expiryDate: 'asc' }
      });
      // Set to earliest remaining batch expiry, or null if none exist
      expiryDateUpdate = { expiryDate: earliestBatch ? earliestBatch.expiryDate : null };
    }
    
    await prisma.$transaction(async (tx) => {
      await tx.stockLog.update({ where: { id }, data: { isVoided: true } });
      await tx.product.update({
        where: { id: log.productId },
        data: { stock: newStock, ...expiryDateUpdate }
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'DELETE',
          entity: 'Stock Movement',
          details: `Voided Stock ${log.type} log for ${log.product.name}, reversing ${log.quantity} units`,
        }
      });

      if (log.type === 'IN' && log.batchId) {
        const batch = await tx.batch.findUnique({ where: { id: log.batchId } });
        if (batch) {
          if (batch.initialQty <= log.quantity) {
             // It was a brand new batch, so delete it entirely
             await tx.batch.delete({ where: { id: log.batchId } });
          } else {
             // It was an addition to an existing batch, just decrement
             await tx.batch.update({ 
                where: { id: log.batchId }, 
                data: { 
                  stock: { decrement: log.quantity },
                  initialQty: { decrement: log.quantity }
                } 
             });
          }
        }
      } else if (log.type === 'OUT') {
        // Stock OUT was deleted -> We must restore stock back into the batches
        if (log.batchId) {
           await tx.batch.update({
              where: { id: log.batchId },
              data: { stock: { increment: log.quantity } }
           });
        } else {
           await restoreBatchStock(tx, log.productId, log.quantity);
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete stock log:', error);
    return NextResponse.json({ error: 'Failed to delete stock log' }, { status: 500 });
  }
}

