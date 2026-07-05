import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'orders');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const { name } = body;
    
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Reference name is required' }, { status: 400 });
    }

    const reference = await prisma.$transaction(async (tx) => {
      const updatedRef = await tx.orderReference.update({
        where: { id },
        data: { name: name.trim() },
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'UPDATE', entity: 'OrderReference', details: `Updated order reference to: ${name}` }
      });
      return updatedRef;
    });

    return NextResponse.json(reference);
  } catch (error: unknown) {
    console.error('Order references PUT error:', error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code === 'P2002') {
      return NextResponse.json({ error: 'An order reference with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update order reference' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'orders');
    if (error) return error;

    const { id } = await params;
    
    await prisma.$transaction(async (tx) => {
      const ref = await tx.orderReference.findUnique({ where: { id } });
      if (!ref) throw new Error('Reference not found');
      await tx.orderReference.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'DELETE', entity: 'OrderReference', details: `Deleted order reference: ${ref.name}` }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Order references DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete order reference' }, { status: 500 });
  }
}
