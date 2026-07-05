import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

type AllowedRole = 'admin' | 'staff' | 'cashier';

/**
 * Authenticate the current request and optionally check role.
 * Returns { user } on success, or { error: NextResponse } on failure.
 *
 * Usage:
 *   const { user, error } = await requireAuth(request);
 *   if (error) return error;
 *   // user is guaranteed to be AuthUser here
 */
export async function requireAuth(
  _request?: unknown,
  allowedRoles?: AllowedRole[]
): Promise<{ user: AuthUser; error?: never } | { user?: never; error: NextResponse }> {
  try {
    const session = await auth();

    if (!session?.user) {
      return {
        error: NextResponse.json(
          { error: 'Authentication required. Please sign in.' },
          { status: 401 }
        ),
      };
    }

    const id = session.user.id;
    const role = session.user.role;

    if (!id || !role) {
      return {
        error: NextResponse.json(
          { error: 'Invalid session. Please sign in again.' },
          { status: 401 }
        ),
      };
    }

    const user: AuthUser = {
      id,
      name: session.user.name || '',
      email: session.user.email || '',
      role,
    };

    // Role check
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role as AllowedRole)) {
        return {
          error: NextResponse.json(
            { error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${user.role}` },
            { status: 403 }
          ),
        };
      }
    }

    return { user };
  } catch (err) {
    console.error('Auth check failed:', err);
    return {
      error: NextResponse.json(
        { error: 'Authentication error. Please sign in again.' },
        { status: 401 }
      ),
    };
  }
}

/**
 * Require admin role.
 */
export async function requireAdmin(request?: unknown) {
  return requireAuth(request, ['admin']);
}

/**
 * Require admin or staff role.
 */
export async function requireStaffOrAdmin(request?: unknown) {
  return requireAuth(request, ['admin', 'staff']);
}

/**
 * Require admin or cashier role.
 */
export async function requireCashierOrAdmin(request?: unknown) {
  return requireAuth(request, ['admin', 'cashier']);
}

/**
 * Require dynamic module permission.
 */
export async function requirePermission(request: unknown, moduleName: string) {
  const { user, error } = await requireAuth(request);
  if (error) return { error };

  if (user.role === 'admin') return { user };

  const settings = await prisma.systemSettings.findUnique({ where: { id: "1" } });
  
  if (!settings) {
    return {
      error: NextResponse.json(
        { error: 'System settings not initialized' },
        { status: 500 }
      ),
    };
  }

  const permissionsString = user.role === 'staff' ? settings.staffPermissions : settings.cashierPermissions;
  const permissions = permissionsString.split(',').map(s => s.trim());

  if (!permissions.includes(moduleName)) {
    return {
      error: NextResponse.json(
        { error: `Access denied. Your role (${user.role}) does not have permission to access the '${moduleName}' module.` },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Sanitize a string to prevent XSS.
 * Escapes HTML entities in user-provided strings.
 */
export function sanitize(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
