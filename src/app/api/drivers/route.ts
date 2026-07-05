import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { driverSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'delivery');
    if (error) return error;

    const drivers = await prisma.driver.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(drivers);
  } catch (error) {
    console.error('Drivers GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'delivery');
    if (error) return error;

    const body = await request.json();

    // Validate input with Zod schema
    const parsed = driverSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, phone, vehicleInfo } = parsed.data;
    const driver = await prisma.$transaction(async (tx) => {
      const newDriver = await tx.driver.create({
        data: { name, phone: phone || null, vehicleInfo: vehicleInfo || null }
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'CREATE', entity: 'Driver', details: `Created driver ${name}` }
      });
      return newDriver;
    });
    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    console.error('Drivers POST error:', error);
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 });
  }
}
