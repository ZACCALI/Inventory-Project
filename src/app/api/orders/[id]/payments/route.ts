import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'orders');
    if (error) return error;
    const { id } = await params;
    const payments = await prisma.payment.findMany({ where: { orderId: id }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json(payments);
  } catch (err) {
    console.error('Payments GET error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'orders');
    if (error) return error;
    const { id } = await params;
    const body = await request.json();
    const { amount, method, reference, notes } = body;
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount < 0.01) {
      return NextResponse.json({ error: 'Payment amount must be at least ₱0.01' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { payments: true } });
      if (!order) throw new Error('Order not found');

      const previousTotal = order.payments.reduce((s, p) => s + p.amount, 0);
      const remainingBalance = order.totalAmount - previousTotal;

      if (parsedAmount > remainingBalance + 0.01) {
        throw new Error(`Payment amount exceeds remaining balance (₱${remainingBalance.toFixed(2)})`);
      }

      const payment = await tx.payment.create({
        data: { orderId: id, amount: parsedAmount, method: method || 'cash', reference, notes }
      });

      const totalPaid = previousTotal + parsedAmount;
      const newStatus = totalPaid >= order.totalAmount - 0.01 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';
      await tx.order.update({ where: { id }, data: { paymentStatus: newStatus } });

      await tx.auditLog.create({
        data: { userId: user.id, action: 'CREATE', entity: 'Payment', details: `Recorded payment of ₱${parsedAmount.toFixed(2)} (${method || 'cash'}) for order ${order.orderNumber}` }
      });

      return payment;
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    console.error('Payments POST error:', err);
    const msg = (err as Error).message || 'Failed';
    const isBusinessError = msg.startsWith('Payment amount') || msg.startsWith('Order not found');
    return NextResponse.json({ error: msg }, { status: isBusinessError ? 400 : 500 });
  }
}
