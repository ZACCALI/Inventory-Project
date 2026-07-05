import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(units);
  } catch (error) {
    console.error('Failed to fetch units:', error);
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const body = await request.json();
    const { name } = body;
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Case-insensitive duplicate check
    const existingUnits = await prisma.unit.findMany({ select: { name: true } });
    if (existingUnits.some(u => u.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A unit with this name already exists' }, { status: 400 });
    }

    const unit = await prisma.$transaction(async (tx) => {
      const newUnit = await tx.unit.create({ data: { name } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'CREATE', entity: 'Unit', details: `Created unit ${name}` }
      });
      return newUnit;
    });

    return NextResponse.json(unit, { status: 201 });
  } catch (error: unknown) {
    console.error('Failed to create unit:', error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Unit already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 });
  }
}
