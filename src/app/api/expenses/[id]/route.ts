import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/apiAuth';
import { expenseSchema } from '@/lib/validations';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const bodyRaw = await request.json();
    
    // Validate input with Zod schema
    const parsed = expenseSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { amount, category, description, reference, date } = parsed.data;

    const expense = await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) throw new Error('Expense not found');

      const updatedExpense = await tx.expense.update({
        where: { id },
        data: {
          amount: amount,
          category,
          description,
          reference,
          date: date ? new Date(date) : new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE',
          entity: 'Expense',
          details: `Updated expense: ${description} (₱${amount})`,
          mode: bodyRaw.isOfflineSync ? 'offline' : 'online',
        }
      });

      return updatedExpense;
    });

    return NextResponse.json(expense);
  } catch (error: unknown) {
    console.error('Expenses PUT error:', error);
    if ((error as Error).message === 'Expense not found') {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requireAdmin(_request);
    if (error) return error;

    const { id } = await params;
    let isOfflineSync = false;
    try { const delBody = await _request.json(); isOfflineSync = !!delBody?.isOfflineSync; } catch {}

    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new Error('Expense not found');

      await tx.expense.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'DELETE',
          entity: 'Expense',
          details: `Deleted expense: ${expense.description} (₱${expense.amount})`,
          mode: isOfflineSync ? 'offline' : 'online',
        }
      });
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Expenses DELETE error:', error);
    if ((error as Error).message === 'Expense not found') {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}

