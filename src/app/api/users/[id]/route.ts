import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/apiAuth';
import { hash } from 'bcryptjs';
import { updateUserSchema } from '@/lib/validations';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: adminUser, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    // Prevent self-deletion
    if (id === adminUser.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true } });
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Check for associated records before deleting
    const [orderCount, stockLogCount] = await Promise.all([
      prisma.order.count({ where: { createdById: id } }),
      prisma.stockLog.count({ where: { userId: id } }),
    ]);

    if (orderCount > 0 || stockLogCount > 0) {
      const details = [];
      if (orderCount > 0) details.push(`${orderCount} order(s)`);
      if (stockLogCount > 0) details.push(`${stockLogCount} stock log(s)`);
      return NextResponse.json(
        { error: `Cannot delete this user because they have ${details.join(' and ')} associated with their account. Consider changing their role instead.` },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: adminUser.id, action: 'DELETE', entity: 'User', details: `Deleted user ${targetUser.name} (${targetUser.email})` }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Users DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: adminUser, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, email, role, password } = parsed.data;

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    // Safeguard: Admin cannot demote themselves
    if (id === adminUser.id && role !== 'admin') {
      return NextResponse.json({ error: 'You cannot remove your own admin privileges.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const existingEmailUser = await prisma.user.findUnique({ where: { email } });
    if (existingEmailUser && existingEmailUser.id !== id) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { name, email, role };
    if (password && password.trim().length > 0) {
      updateData.password = await hash(password, 12);
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, email: true, role: true }
      });
      await tx.auditLog.create({
        data: { userId: adminUser.id, action: 'UPDATE', entity: 'User', details: `Updated user ${name} (${email}) to role ${role}` }
      });
      return updated;
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Users PUT error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
