import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { customerSchema } from '@/lib/validations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'customers');
    if (error) return error;

    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id }, include: { orders: { include: { items: true }, orderBy: { createdAt: 'desc' } } } });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json(customer);
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'customers');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // Validate input with Zod schema
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const customer = await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { name: parsed.data.name, contactPerson: parsed.data.contactPerson, phone: parsed.data.phone, email: parsed.data.email, address: parsed.data.address, customerType: parsed.data.customerType } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'UPDATE', entity: 'Customer', details: `Updated customer ${updated.name}` }
      });
      return updated;
    });
    return NextResponse.json(customer);
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'customers');
    if (error) return error;

    const { id } = await params;
    // Check for existing orders before deleting
    const customer = await prisma.customer.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    if (customer.name === '[Normal Walk-in]') {
      return NextResponse.json({ error: 'The default walk-in customer cannot be deleted.' }, { status: 400 });
    }
    if (customer._count.orders > 0) {
      return NextResponse.json({ error: `Cannot delete customer with ${customer._count.orders} existing orders. Archive or reassign orders first.` }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'DELETE', entity: 'Customer', details: `Deleted customer ${customer.name}` }
      });
    });
    return NextResponse.json({ message: 'Deleted' });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
