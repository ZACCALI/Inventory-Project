import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;
    
    const { id } = await params;
    const body = await request.json();

    const reference = await prisma.orderReference.update({
      where: { id },
      data: { name: body.name },
    });
    return NextResponse.json(reference);
  } catch (error) {
    console.error('Reference PUT error:', error);
    return NextResponse.json({ error: 'Failed to update reference' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await params;
    await prisma.orderReference.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reference DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete reference' }, { status: 500 });
  }
}
