import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';
import { rateLimit } from '@/lib/rateLimit';
import { createStockMovementSchema } from '@/lib/validations';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const logs = await prisma.stockLog.findMany({
      include: {
        product: { include: { category: true } },
        user: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const formattedLogs = logs.map(log => ({
      id: log.id,
      date: log.createdAt.toISOString(),
      product: log.product.name,
      sku: log.product.sku,
      image: log.product.image,
      category: log.product.category?.name || '-',
      type: log.type,
      quantity: log.quantity,
      reference: log.reason,
      source: log.source,
      user: log.user?.name || 'System',
      productId: log.productId,
      isVoided: log.isVoided,
    }));

    return NextResponse.json(formattedLogs);
  } catch (error) {
    console.error('Failed to fetch stock logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    // Rate limit: 30 stock movements per user per minute
    const { allowed } = rateLimit(`stock:${user.id}`, 30, 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment before trying again.' }, { status: 429 });
    }

    const body = await request.json();

    // Validate input with Zod schema
    const parsed = createStockMovementSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { productId, type, quantity: rawQuantity, reason, source: validatedSource, expiryDate, forceBatchId, batchNumber, targetBatchId } = parsed.data;
    const userId = user.id;

    const actualQuantity = rawQuantity;
    const finalReason = reason;

    // Execute everything inside a transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // Re-read the product INSIDE the transaction for atomicity
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error('PRODUCT_NOT_FOUND');

      const newStock = type === 'IN' ? product.stock + actualQuantity : product.stock - actualQuantity;

      if (newStock < 0) {
        throw new Error(`Cannot issue ${actualQuantity} items. The current available stock is only ${product.stock}.`);
      }

      let stockLogBatchId: string | null = null;

      if (type === 'IN') {
        if (validatedSource === 'AUDIT') {
          // AUDIT adjustments: Use the specific batch selected by the user in the Batch Selection Modal.
          // This ensures audit stock goes to the correct batch with the right expiry date.
          if (targetBatchId && targetBatchId !== 'NEW') {
            // User selected an existing batch
            const targetBatch = await tx.batch.findUnique({ where: { id: targetBatchId } });
            if (!targetBatch || targetBatch.productId !== productId) {
              throw new Error('BATCH_NOT_FOUND');
            }
            stockLogBatchId = targetBatch.id;
            await tx.batch.update({
              where: { id: targetBatch.id },
              data: {
                stock: { increment: actualQuantity },
                initialQty: { increment: actualQuantity }
              }
            });
          } else if (targetBatchId === 'NEW') {
            // User chose to create a new batch
            const newBatchId = crypto.randomUUID();
            stockLogBatchId = newBatchId;
            await tx.batch.create({
              data: {
                id: newBatchId,
                productId,
                initialQty: actualQuantity,
                stock: actualQuantity,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                batchNumber: batchNumber || null,
              }
            });
          } else {
            // Fallback: no targetBatchId provided — add to most recent existing batch
            const existingBatch = await tx.batch.findFirst({
              where: { productId },
              orderBy: [{ expiryDate: 'desc' }, { createdAt: 'desc' }]
            });
            if (existingBatch) {
              stockLogBatchId = existingBatch.id;
              await tx.batch.update({
                where: { id: existingBatch.id },
                data: {
                  stock: { increment: actualQuantity },
                  initialQty: { increment: actualQuantity }
                }
              });
            } else {
              const newBatchId = crypto.randomUUID();
              stockLogBatchId = newBatchId;
              await tx.batch.create({
                data: {
                  id: newBatchId,
                  productId,
                  initialQty: actualQuantity,
                  stock: actualQuantity,
                  expiryDate: null,
                }
              });
            }
          }
        } else {
          // Normal Stock IN — Create a new batch
          const newBatchId = crypto.randomUUID();
          stockLogBatchId = newBatchId;
          await tx.batch.create({
            data: {
              id: newBatchId,
              productId,
              initialQty: actualQuantity,
              stock: actualQuantity,
              expiryDate: expiryDate ? new Date(expiryDate) : null,
              batchNumber: batchNumber || null,
            }
          });
        }
      } else if (type === 'OUT') {
        // Deduct from batches using FEFO (First Expire First Out)
        const availableBatches = await tx.batch.findMany({
          where: { 
            productId, 
            stock: { gt: 0 },
            ...(forceBatchId ? { id: forceBatchId } : {})
          }
        });

        // SQLite puts nulls first in ASC sort. We must manually sort in JS to put null expiryDates last!
        availableBatches.sort((a, b) => {
          if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime();
          if (a.expiryDate && !b.expiryDate) return -1;
          if (!a.expiryDate && b.expiryDate) return 1;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        let remainingToDeduct = actualQuantity;
        for (const batch of availableBatches) {
          if (remainingToDeduct <= 0) break;
          if (!stockLogBatchId) stockLogBatchId = batch.id; // Link to primary batch

          const deductAmount = Math.min(batch.stock, remainingToDeduct);
          remainingToDeduct -= deductAmount;

          await tx.batch.update({
            where: { id: batch.id },
            data: { stock: batch.stock - deductAmount }
          });
        }
      }

      // Determine new expiry date for the product
      let finalExpiryDate: Date | null | undefined = type === 'IN' && expiryDate ? new Date(expiryDate) : undefined;
      if (type === 'OUT') {
        // Find the earliest remaining batch that still has stock after deduction
        const remainingBatches = await tx.batch.findMany({
          where: { productId, stock: { gt: 0 }, expiryDate: { not: null } },
          orderBy: { expiryDate: 'asc' }
        });
        finalExpiryDate = remainingBatches.length > 0 ? remainingBatches[0].expiryDate : null;
      }

      // Create stock log
      const stockLog = await tx.stockLog.create({
        data: {
          type,
          quantity: actualQuantity,
          reason: finalReason,
          source: validatedSource,
          productId,
          userId,
          batchId: stockLogBatchId
        }
      });

      // Update product stock
      await tx.product.update({
        where: { id: productId },
        data: { 
          stock: newStock,
          ...(finalExpiryDate !== undefined ? { expiryDate: finalExpiryDate } : {})
        }
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Stock Movement',
          details: `Recorded Stock ${type} of ${actualQuantity} for ${product.name} (Ref: ${finalReason})`,
        }
      });

      return stockLog;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Failed to update stock:', error);
    // Handle known validation errors thrown from inside the transaction
    if ((error as Error)?.message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    if ((error as Error)?.message === 'BATCH_NOT_FOUND') {
      return NextResponse.json({ error: 'Selected batch not found' }, { status: 404 });
    }
    if ((error as Error)?.message?.startsWith('Cannot issue')) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update stock' }, { status: 500 });
  }
}

