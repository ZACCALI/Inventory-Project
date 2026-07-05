import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { createDeliverySchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'delivery');
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) where.status = status;
    
    if (startDate || endDate) {
      where.scheduledDate = {};
      if (startDate) where.scheduledDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.scheduledDate.lt = end;
      }
    }

    if (search) {
      where.OR = [
        { driverName: { contains: search } },
        { driverPhone: { contains: search } },
        { order: { orderNumber: { contains: search } } },
        { order: { customer: { name: { contains: search } } } },
      ];
    }

    const [deliveries, total] = await Promise.all([
      prisma.delivery.findMany({ 
        where, 
        include: { order: { include: { customer: true } } }, 
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.delivery.count({ where })
    ]);
    return NextResponse.json(deliveries, { headers: { 'X-Total-Count': total.toString() } });
  } catch (error) { 
    console.error(error); 
    return NextResponse.json({ error: 'Failed' }, { status: 500 }); 
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'delivery');
    if (error) return error;

    const body = await request.json();

    // Validate input with Zod schema
    const parsed = createDeliverySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const delivery = await prisma.$transaction(async (tx) => {
      const newDelivery = await tx.delivery.create({
        data: { 
          orderId: parsed.data.orderId, 
          driverName: parsed.data.driverName || null, 
          driverPhone: parsed.data.driverPhone || null, 
          scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : null, 
          status: 'pending' 
        },
        include: { order: { include: { customer: true } } },
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'CREATE', entity: 'Delivery', details: `Created delivery for order ${newDelivery.order.orderNumber}` }
      });
      return newDelivery;
    });

    return NextResponse.json(delivery, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
