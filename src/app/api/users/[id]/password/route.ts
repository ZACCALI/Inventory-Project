import { NextRequest, NextResponse } from 'next/server';
import { hash, compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validations';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const currentUserId = session.user.id;

    // Users can only change their own password, unless they are admin (maybe? usually even admin shouldn't change password directly without resetting it, but let's just restrict to own user for now)
    if (id !== currentUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate input with Zod schema
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPasswordValid = await compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Incorrect current password' }, { status: 400 });
    }

    const hashedPassword = await hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { password: hashedPassword }
      });
      await tx.auditLog.create({
        data: {
          userId: id,
          action: 'UPDATE',
          entity: 'User Security',
          details: `User changed their own password`
        }
      });
    });

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Failed to update password:', error);
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    );
  }
}

