import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/apiAuth';
import { customerSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'customers');
    if (error) return error;

    const search = request.nextUrl.searchParams.get('search') || '';
    const customerType = request.nextUrl.searchParams.get('customerType') || '';
    
    const where: Record<string, unknown> = {};
    if (search) { where.OR = [{ name: { contains: search } }, { contactPerson: { contains: search } }, { email: { contains: search } }]; }
    if (customerType && customerType !== 'All') { where.customerType = customerType; }
    
    let customers = await prisma.customer.findMany({ where, include: { _count: { select: { orders: true } } }, orderBy: { name: 'asc' } });
    
    // Bulletproof Auto-Recovery: Ensure [Normal Walk-in] always exists
    const walkInExists = await prisma.customer.findFirst({ where: { name: '[Normal Walk-in]' } });
    if (!walkInExists) {
      await prisma.customer.create({
        data: { name: '[Normal Walk-in]', customerType: 'walk-in' }
      });
      // Re-fetch to include the newly created profile
      customers = await prisma.customer.findMany({ where, include: { _count: { select: { orders: true } } }, orderBy: { name: 'asc' } });
    }

    return NextResponse.json(customers);
  } catch (error) { console.error('Customers GET error:', error); return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'customers');
    if (error) return error;

    const body = await request.json();
    
    // Validate input with Zod schema
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const customer = await prisma.$transaction(async (tx) => {
      const newCustomer = await tx.customer.create({ data: { name: parsed.data.name, contactPerson: parsed.data.contactPerson, phone: parsed.data.phone, email: parsed.data.email, address: parsed.data.address, customerType: parsed.data.customerType || 'wholesale' } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entity: 'Customer',
          details: `Created customer ${body.name}`,
        }
      });
      return newCustomer;
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) { console.error('Customers POST error:', error); return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 }); }
}
