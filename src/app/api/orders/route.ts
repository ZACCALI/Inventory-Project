import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission} from '@/lib/apiAuth';
import { createOrderSchema } from '@/lib/validations';
import { rateLimit } from '@/lib/rateLimit';
import { checkAndSetIdempotency } from '@/lib/idempotency';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'orders');
    if (error) return error;

    const search = request.nextUrl.searchParams.get('search') || '';
    const status = request.nextUrl.searchParams.get('status') || '';
    const paymentStatus = request.nextUrl.searchParams.get('paymentStatus') || '';
    const orderType = request.nextUrl.searchParams.get('orderType') || '';
    const customerId = request.nextUrl.searchParams.get('customerId') || '';
    const showArchived = request.nextUrl.searchParams.get('archived') === 'true';
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { customer: { name: { contains: search } } },
      ];
    }
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (orderType) {
      if (orderType === 'delivery') {
        where.delivery = { isNot: null };
      } else if (orderType === 'walkin') {
        where.delivery = null;
      } else {
        where.orderType = orderType;
      }
    }
    if (customerId) where.customerId = customerId;
    
    if (showArchived) {
      where.isArchived = true;
    } else {
      where.isArchived = false;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: true,
          items: { include: { product: true } },
          delivery: true,
          createdBy: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json(orders, {
      headers: { 'X-Total-Count': total.toString() },
    });
  } catch (error) {
    console.error('Orders GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'orders');
    if (error) return error;

    // Rate limit: 15 order creations per user per minute
    const { allowed } = rateLimit(`orders:${user.id}`, 15, 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await request.json();
    
    const isDuplicate = await checkAndSetIdempotency(body.idempotencyKey);
    if (isDuplicate) {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    // Validate input with Zod schema
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { customerId, items, orderReference, orderType, status, paymentStatus, amountPaid, isDelivery, deliveryDriverId, deliveryDriverName, deliveryDate, isOfflineSync, customerName } = parsed.data;
    let { notes, discount, orderDate } = parsed.data;

    if (!notes && orderReference) {
      notes = orderReference;
    }

    // Sanitize discount to strictly absolute positive numbers to prevent negative inflation
    discount = Math.max(0, Math.abs(Number(discount) || 0));

    // Use authenticated user's ID instead of body.createdById
    const createdById = user.id;

    let finalCustomerId = customerId;
    if (!finalCustomerId && customerName) {
      let cust = await prisma.customer.findFirst({ where: { name: customerName } });
      if (!cust) {
        cust = await prisma.customer.create({
          data: { name: customerName, customerType: 'walk-in' }
        });
      }
      finalCustomerId = cust.id;
    }

    if (!finalCustomerId || !items || items.length === 0) {
      return NextResponse.json({ error: 'customerId or customerName, and items are required' }, { status: 400 });
    }

    // Generate order number
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    let prefix = 'HOME';
    if (orderType === 'pos') {
      prefix = 'STORE';
    } else if (isDelivery) {
      prefix = 'DELIVERY';
    } else {
      prefix = 'WALKIN';
    }
    
    const orderNumber = `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Calculate totals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderItems = items.map((item: any) => {
      // Fix for UI sometimes sending qty instead of quantity
      const quantity = item.quantity !== undefined ? item.quantity : item.qty;
      const multiplier = item.multiplier ? parseInt(item.multiplier) : 1;
      return {
        productId: item.productId,
        quantity: quantity,
        price: item.price,
        subtotal: quantity * item.price,
        uomName: item.uomName || null,
        multiplier: multiplier,
        _totalStockNeeded: quantity * multiplier,
      };
    });
    const subtotal = orderItems.reduce((sum: number, item: { subtotal: number }) => sum + item.subtotal, 0);
    const totalAmount = Math.max(0, subtotal - discount);

    // Create order and reduce stock in transaction
    const order = await prisma.$transaction(async (tx) => {
      const settings = await tx.systemSettings.findUnique({ where: { id: "1" } });
      if (settings?.lockOrderDate && user.role !== 'admin') {
        // Force to current date if locked
        orderDate = new Date().toISOString();
      }

      let totalCost = 0;

      // Verify stock first
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      await Promise.all(orderItems.map(async (item: any) => {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || (product.stock < item._totalStockNeeded && !isOfflineSync)) {
          throw new Error(`Insufficient stock for product ID ${item.productId}`);
        }
        if (product) {
          totalCost += (product.costPrice * item._totalStockNeeded);
        }
      }));

      // Profit margin safety check - Enforced for ALL orders including Walk-in Store
      if (totalAmount < totalCost) {
        throw new Error(`Discount too high! The final selling price (₱${totalAmount.toFixed(2)}) must not be less than your total cost price (₱${totalCost.toFixed(2)}).`);
      }

      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          totalAmount,
          discount,
          orderType,
          status: status || 'pending',
          paymentStatus: paymentStatus || 'unpaid',
          notes,
          orderDate: orderDate ? new Date(orderDate) : new Date(),
          customerId: finalCustomerId,
          createdById,
          items: { 
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
            create: orderItems.map(({ _totalStockNeeded, ...rest }: any) => rest)
          },
        },
        include: { customer: true, items: { include: { product: true } }, createdBy: { select: { id: true, name: true } } },
      });

      // Reduce stock for each item and log it
      for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        
        // If offline sync forces the order despite low stock, just deduct what's there and let it go negative in DB if allowed
        if (isOfflineSync && product && product.stock < item._totalStockNeeded) {
           console.warn(`Offline sync: Allowing negative stock for product ${product.name}`);
        }

        // 1. Deduct from batches using FEFO
        const availableBatches = await tx.batch.findMany({
          where: { productId: item.productId, stock: { gt: 0 } }
        });

        // SQLite puts nulls first in ASC sort. We must manually sort in JS to put null expiryDates last!
        availableBatches.sort((a, b) => {
          if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime();
          if (a.expiryDate && !b.expiryDate) return -1;
          if (!a.expiryDate && b.expiryDate) return 1;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        let remainingToDeduct = item._totalStockNeeded;
        for (const batch of availableBatches) {
          if (remainingToDeduct <= 0) break;
          const deductAmount = Math.min(batch.stock, remainingToDeduct);
          remainingToDeduct -= deductAmount;
          await tx.batch.update({
            where: { id: batch.id },
            data: { stock: batch.stock - deductAmount }
          });
        }

        if (remainingToDeduct > 0) {
          const oldestBatch = await tx.batch.findFirst({
            where: { productId: item.productId },
            orderBy: { createdAt: 'asc' }
          });
          if (oldestBatch) {
            await tx.batch.update({
              where: { id: oldestBatch.id },
              data: { stock: oldestBatch.stock - remainingToDeduct }
            });
          } else {
            await tx.batch.create({
              data: {
                productId: item.productId,
                batchNumber: 'ADJ-OFFLINE',
                initialQty: 0,
                stock: -remainingToDeduct,
                expiryDate: null
              }
            });
          }
        }

        // 2. Deduct from global stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item._totalStockNeeded } },
        });

        await tx.stockLog.create({
          data: {
            productId: item.productId,
            type: 'OUT',
            quantity: item._totalStockNeeded,
            reason: `${orderType === 'pos' ? 'Store' : (isDelivery ? 'Delivery' : 'Walk in')} (Order #${orderNumber.split('-').pop()} - Input: ${item.quantity} ${item.uomName || 'Pack/Pcs'})`,
            source: orderType === 'pos' ? 'WALK_IN_STORE' : (isDelivery ? 'DELIVERY' : 'WALK_IN_HOME'),
            userId: createdById,
          }
        });
      }

      // Handle Delivery creation
      if (isDelivery || deliveryDriverName || deliveryDate) {
        await tx.delivery.create({
          data: {
            orderId: newOrder.id,
            driverId: deliveryDriverId || null,
            driverName: deliveryDriverName || null,
            scheduledDate: deliveryDate ? new Date(deliveryDate) : null,
            status: 'pending',
          }
        });
      }

      // Create initial Payment record if paid/partial
      if (['paid', 'partial'].includes(paymentStatus || 'unpaid')) {
        let finalAmountPaid = Number(amountPaid) || 0;
        
        if (!finalAmountPaid && notes) {
          const match = notes.match(/Amount Paid:\s*₱\s*([\d,.]+)/);
          if (match) {
            finalAmountPaid = parseFloat(match[1].replace(/,/g, '')) || 0;
          }
        }

        if (finalAmountPaid > 0) {
          await tx.payment.create({
            data: {
              amount: finalAmountPaid,
              method: 'cash',
              notes: 'Initial checkout payment',
              orderId: newOrder.id,
              createdAt: newOrder.orderDate
            }
          });
        }
      }

      // Create audit log
      const entityLabel = orderType === 'pos' ? 'Order (Walk in Store)' : (isDelivery ? 'Order (Delivery)' : 'Order (Walk in Home)');
      const friendlyLabel = orderType === 'pos' ? 'Walk in Store' : (isDelivery ? 'Delivery' : 'Walk in Home');
      await tx.auditLog.create({
        data: {
          userId: createdById,
          action: 'CREATE',
          entity: entityLabel,
          details: `Created ${friendlyLabel} order ${orderNumber} for total ₱${totalAmount}`,
          mode: isOfflineSync ? 'offline' : 'online',
        }
      });

      return newOrder;
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Orders POST error:', err);
    
    // Check if it is a known business validation error
    const isBusinessError = 
      err.message?.startsWith('Insufficient stock') || 
      err.message?.startsWith('Discount too high');
      
    if (isBusinessError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    
    // Security Fix: Prevent internal database/architecture errors from leaking to the client.
    return NextResponse.json({ error: 'An internal server error occurred while processing your order.' }, { status: 500 });
  }
}

