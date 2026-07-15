import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { driverSchema } from '@/lib/validations';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'drivers');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // Validate input with Zod schema
    const parsed = driverSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, phone, vehicleInfo, status } = parsed.data;
    const driver = await prisma.$transaction(async (tx) => {
      const updated = await tx.driver.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(vehicleInfo !== undefined && { vehicleInfo }),
          ...(status !== undefined && { status }),
        }
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'UPDATE', entity: 'Driver', details: `Updated driver ${updated.name}`, mode: body.isOfflineSync ? 'offline' : 'online' }
      });
      return updated;
    });
    return NextResponse.json(driver);
  } catch (error) {
    console.error('Driver PUT error:', error);
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'drivers');
    if (error) return error;

    const { id } = await params;
    const driver = await prisma.driver.findUnique({ 
      where: { id },
      include: { _count: { select: { deliveries: true } } }
    });
    
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    
    if (driver._count.deliveries > 0) {
      return NextResponse.json({ 
        error: `Cannot delete this driver because they have ${driver._count.deliveries} delivery assignments. Reassign or remove their deliveries first.` 
      }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.driver.delete({ where: { id } });
      let isOfflineSync = false;
      try { const delBody = await request.clone().json(); isOfflineSync = !!delBody?.isOfflineSync; } catch {}
      await tx.auditLog.create({
        data: { userId: user.id, action: 'DELETE', entity: 'Driver', details: `Deleted driver ${driver.name}`, mode: isOfflineSync ? 'offline' : 'online' }
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Driver DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
  }
}
