import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'orders');
    if (error) return error;

    const references = await prisma.orderReference.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(references);
  } catch (error) {
    console.error('Order references GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch order references' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'orders');
    if (error) return error;

    const body = await request.json();
    const { name } = body;
    
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Reference name is required' }, { status: 400 });
    }

    const reference = await prisma.$transaction(async (tx) => {
      const newRef = await tx.orderReference.create({
        data: { name: name.trim() },
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'CREATE', entity: 'OrderReference', details: `Created order reference: ${name}` }
      });
      return newRef;
    });

    return NextResponse.json(reference, { status: 201 });
  } catch (error: unknown) {
    console.error('Order references POST error:', error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code === 'P2002') {
      return NextResponse.json({ error: 'An order reference with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create order reference' }, { status: 500 });
  }
}
