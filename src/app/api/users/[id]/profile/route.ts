import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

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

    // Users can strictly only change their own profile
    if (id !== currentUserId) {
      return NextResponse.json({ error: 'Forbidden. You can only edit your own profile.' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, avatar } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const existingEmailUser = await prisma.user.findUnique({ where: { email } });
    if (existingEmailUser && existingEmailUser.id !== id) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataToUpdate: any = { name, email };
      if (avatar !== undefined) dataToUpdate.avatar = avatar;

      const updated = await tx.user.update({
        where: { id },
        data: dataToUpdate,
        select: { id: true, name: true, email: true, role: true, avatar: true }
      });
      await tx.auditLog.create({
        data: { userId: currentUserId, action: 'UPDATE', entity: 'User Profile', details: `User updated their own profile (${name}, ${email})` }
      });
      return updated;
    });

    return NextResponse.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Failed to update profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
