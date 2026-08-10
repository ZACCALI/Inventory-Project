import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin, invalidateSettingsCache } from '@/lib/apiAuth';
import { settingsSchema } from '@/lib/validations';
import { checkAndSetIdempotency } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {

    let settings = await prisma.systemSettings.findUnique({
      where: { id: "1" }
    });
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: { id: "1", companyName: "Amroding General Merchandise" }
      });
    }
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const bodyRaw = await request.json();
    const isOfflineSync = Boolean(
      bodyRaw?.isOfflineSync || 
      request.headers.get('x-offline-sync') === '1' || 
      request.headers.get('x-offline-sync') === 'true'
    );
    
    const isDuplicate = await checkAndSetIdempotency(bodyRaw.idempotencyKey);
    if (isDuplicate) {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    // Validate input with Zod schema
    const parsed = settingsSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      console.error('Zod Validation Error:', parsed.error.issues);
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const body = parsed.data;
    const settings = await prisma.$transaction(async (tx) => {
      const existing = await tx.systemSettings.findUnique({ where: { id: "1" } });

      const updated = await tx.systemSettings.upsert({
        where: { id: "1" },
        update: {
          companyName: body.companyName,
          email: body.email,
          phone: body.phone,
          address: body.address,
          currency: body.currency,
          taxRate: body.taxRate || 0,
          cleanupMode: body.cleanupMode,
          lockProductDelete: body.lockProductDelete,
          lockProductEdit: body.lockProductEdit,
          lockOrderDelete: body.lockOrderDelete,
          lockOrderEdit: body.lockOrderEdit,
          lockOrderCancel: body.lockOrderCancel,
          lockOrderDate: body.lockOrderDate,
          lockStockVoid: body.lockStockVoid,
          expiryWarningDays: body.expiryWarningDays || 30,
          staffPermissions: body.staffPermissions,
          cashierPermissions: body.cashierPermissions,
          ...(body.stockInReasons !== undefined && { stockInReasons: body.stockInReasons }),
          ...(body.stockOutReasons !== undefined && { stockOutReasons: body.stockOutReasons }),
          ...(body.expenseCategories !== undefined && { expenseCategories: body.expenseCategories }),
          ...(body.printerName !== undefined && { printerName: body.printerName }),
          ...(body.paperWidth !== undefined && { paperWidth: body.paperWidth }),
          ...(body.autoPrintOrder !== undefined && { autoPrintOrder: body.autoPrintOrder }),
          ...(body.connectionType !== undefined && { connectionType: body.connectionType }),
          ...(body.printerIp !== undefined && { printerIp: body.printerIp }),
          ...(body.printerPort !== undefined && { printerPort: body.printerPort })
        },
        create: {
          id: "1",
          companyName: body.companyName || "Amroding General Merchandise",
          email: body.email,
          phone: body.phone,
          address: body.address,
          currency: body.currency || "PHP",
          taxRate: body.taxRate || 0,
          cleanupMode: body.cleanupMode || false,
          lockProductDelete: body.lockProductDelete ?? true,
          lockProductEdit: body.lockProductEdit ?? false,
          lockOrderDelete: body.lockOrderDelete ?? true,
          lockOrderEdit: body.lockOrderEdit ?? false,
          lockOrderCancel: body.lockOrderCancel ?? false,
          lockOrderDate: body.lockOrderDate ?? false,
          lockStockVoid: body.lockStockVoid ?? false,
          expiryWarningDays: body.expiryWarningDays || 30,
          staffPermissions: body.staffPermissions,
          cashierPermissions: body.cashierPermissions,
          ...(body.stockInReasons !== undefined && { stockInReasons: body.stockInReasons }),
          ...(body.stockOutReasons !== undefined && { stockOutReasons: body.stockOutReasons }),
          ...(body.expenseCategories !== undefined && { expenseCategories: body.expenseCategories }),
          ...(body.printerName !== undefined && { printerName: body.printerName }),
          ...(body.paperWidth !== undefined && { paperWidth: body.paperWidth }),
          ...(body.autoPrintOrder !== undefined && { autoPrintOrder: body.autoPrintOrder }),
          ...(body.connectionType !== undefined && { connectionType: body.connectionType }),
          ...(body.printerIp !== undefined && { printerIp: body.printerIp }),
          ...(body.printerPort !== undefined && { printerPort: body.printerPort })
        }
      });
      let hasChanges = false;
      if (!existing) {
        hasChanges = true;
      } else {
        for (const key of Object.keys(body)) {
          if (key === 'idempotencyKey') continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldVal = (existing as any)[key];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newVal = (body as any)[key];
          if (newVal !== undefined) {
            if (typeof oldVal === 'object' && oldVal !== null) {
              if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                hasChanges = true;
                break;
              }
            } else if (oldVal !== newVal) {
              hasChanges = true;
              break;
            }
          }
        }
      }

      if (hasChanges) {
        await tx.auditLog.create({
          data: { userId: user.id, action: 'UPDATE', entity: 'Settings', details: `Updated system settings`, mode: isOfflineSync ? 'offline' : 'online' }
        });
      }

      return updated;
    });

    invalidateSettingsCache();

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

