import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await context.params;
    const body = await request.json();
    const { name } = body;
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Case-insensitive duplicate check
    const existingUnits = await prisma.unit.findMany({ select: { id: true, name: true } });
    if (existingUnits.some(u => u.id !== id && u.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A unit with this name already exists' }, { status: 400 });
    }

    const unit = await prisma.$transaction(async (tx) => {
      const updatedUnit = await tx.unit.update({ where: { id }, data: { name } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'UPDATE', entity: 'Unit', details: `Updated unit ${name}` }
      });
      return updatedUnit;
    });
    return NextResponse.json(unit);
  } catch (error: unknown) {
    console.error('Failed to update unit:', error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'A unit with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await context.params;
    const unit = await prisma.unit.findUnique({ where: { id } });
    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    
    const productsCount = await prisma.product.count({ where: { unit: unit.name } });
    if (productsCount > 0) {
      return NextResponse.json({ error: `Cannot delete unit: ${productsCount} products are using it.` }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.unit.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'DELETE', entity: 'Unit', details: `Deleted unit ${unit.name}` }
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete unit:', error);
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 });
  }
}
