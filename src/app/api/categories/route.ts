import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';
import { checkAndSetIdempotency } from '@/lib/idempotency';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Categories GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const body = await request.json();

    const isDuplicate = await checkAndSetIdempotency(body.idempotencyKey);
    if (isDuplicate) {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    if (!body.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    // Case-insensitive duplicate check
    const existingCategory = await prisma.category.findFirst({
      where: { name: { equals: body.name, mode: 'insensitive' } },
      select: { id: true }
    });
    if (existingCategory) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
    }

    const category = await prisma.$transaction(async (tx) => {
      const newCat = await tx.category.create({ data: { name: body.name, description: body.description } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'CREATE', entity: 'Category', details: `Created category ${body.name}` }
      });
      return newCat;
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: unknown) {
    console.error('Categories POST error:', error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
