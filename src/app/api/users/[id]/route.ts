import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/apiAuth';
import { hash } from 'bcryptjs';

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
      // Delete audit logs first (since they reference the user)
      await tx.auditLog.deleteMany({ where: { userId: id } });
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
    const { name, email, role, password } = body;

    if (!name || !email || !role) {
      return NextResponse.json({ error: 'Name, email, and role are required' }, { status: 400 });
    }

    if (!['admin', 'staff', 'cashier'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
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
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
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
