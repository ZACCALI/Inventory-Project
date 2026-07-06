import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/apiAuth';
import { expenseSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const search = request.nextUrl.searchParams.get('search') || '';
    const category = request.nextUrl.searchParams.get('category') || '';
    const startDate = request.nextUrl.searchParams.get('startDate') || '';
    const endDate = request.nextUrl.searchParams.get('endDate') || '';
    
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { category: { contains: search } },
        { reference: { contains: search } },
      ];
    }
    
    if (category) {
      where.category = category;
    }
    
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.date.lt = end;
      }
    }
    
    const expenses = await prisma.expense.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { date: 'desc' }
    });
    
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Expenses GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const bodyRaw = await request.json();
    
    // Validate input with Zod schema
    const parsed = expenseSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { amount, category, description, reference, date } = parsed.data;

    const parsedAmount = amount;
    
    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          amount: parsedAmount,
          category,
          description,
          reference,
          date: date ? new Date(date) : new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entity: 'Expense',
          details: `Logged expense: ${description} (₱${parsedAmount})`,
          mode: bodyRaw.isOfflineSync ? 'offline' : 'online',
        }
      });

      return newExpense;
    });
    
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error('Expenses POST error:', error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

