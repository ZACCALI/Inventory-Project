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

    // Guard: offline temp IDs are not yet in the database
    if (String(id).startsWith('OFF-')) {
      return NextResponse.json({ error: 'This category was created offline and has not yet synced to the server. Please wait for sync to complete before editing.' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Case-insensitive duplicate check
    const existingCategory = await prisma.category.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: 'insensitive' } },
      select: { id: true }
    });
    if (existingCategory) {
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
    const prismaError = error as { code?: string };
    if (prismaError.code === 'P2002') {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
    }
    if (prismaError.code === 'P2025') {
      return NextResponse.json({ error: 'Category not found. It may have been deleted.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await context.params;

    // Guard: offline temp IDs are not yet in the database
    if (String(id).startsWith('OFF-')) {
      return NextResponse.json({ error: 'This category was created offline and has not yet synced. It cannot be deleted until sync completes.' }, { status: 400 });
    }
    
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
    const prismaError = error as { code?: string };
    if (prismaError.code === 'P2025') {
      return NextResponse.json({ error: 'Category not found. It may have already been deleted.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}

