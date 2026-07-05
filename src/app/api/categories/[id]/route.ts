import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await context.params;
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Case-insensitive duplicate check
    const existingCategories = await prisma.category.findMany({ select: { id: true, name: true } });
    if (existingCategories.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
    }

    const category = await prisma.$transaction(async (tx) => {
      const updatedCategory = await tx.category.update({
        where: { id },
        data: { name, description },
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'UPDATE', entity: 'Category', details: `Updated category ${name}` }
      });
      return updatedCategory;
    });

    return NextResponse.json(category);
  } catch (error: unknown) {
    console.error('Failed to update category:', error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await context.params;
    
    const productsCount = await prisma.product.count({ where: { categoryId: id } });
    if (productsCount > 0) {
      return NextResponse.json({ error: `Cannot delete category: ${productsCount} products are attached to it.` }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const deletedCategory = await tx.category.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'DELETE', entity: 'Category', details: `Deleted category ${deletedCategory.name}` }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete category:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
