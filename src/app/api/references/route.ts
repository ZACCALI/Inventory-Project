import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const references = await prisma.orderReference.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(references);
  } catch (error) {
    console.error('References GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch references' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const existing = await prisma.orderReference.findUnique({ where: { name: body.name } });
    if (existing) {
      return NextResponse.json({ error: 'Reference name already exists' }, { status: 400 });
    }

    const reference = await prisma.orderReference.create({
      data: {
        name: body.name,
      },
    });
    return NextResponse.json(reference, { status: 201 });
  } catch (error) {
    console.error('References POST error:', error);
    return NextResponse.json({ error: 'Failed to create reference' }, { status: 500 });
  }
}
