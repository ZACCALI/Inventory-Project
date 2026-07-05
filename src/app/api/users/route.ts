import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { requireAdmin} from '@/lib/apiAuth';
import { createUserSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { role: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          avatar: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ]);
    return NextResponse.json(users, { headers: { 'X-Total-Count': total.toString() } });
  } catch (error) {
    console.error('Users GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();

    // Validate input with Zod schema
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, email, password, role } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, password: hashedPassword, role },
        select: { id: true, name: true, email: true, role: true }
      });
      await tx.auditLog.create({
        data: { userId: adminUser.id, action: 'CREATE', entity: 'User', details: `Created user ${name} (${email}) with role ${role}` }
      });
      return created;
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Users POST error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

