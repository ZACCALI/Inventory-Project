import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission, requireAdmin } from '@/lib/apiAuth';
import { updateProductSchema } from '@/lib/validations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, uoms: true, stockLogs: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: true } }, orderItems: { include: { order: true } } },
    });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    console.error('Product GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // Validate input with Zod schema
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name, sku, barcode, image, price, costPrice, stock, minStock, unit, expiryDate, categoryId, isArchived, uoms } = parsed.data;

    // Enforce selling price > cost price for base unit
    if (price !== undefined && costPrice !== undefined) {
      if (price <= costPrice) {
        return NextResponse.json({ error: `Pricing Error: Base Selling Price (${price}) must be higher than Cost Price (${costPrice}).` }, { status: 400 });
      }
    } else if (price !== undefined || costPrice !== undefined) {
      // Need to fetch current to validate if only one is updated
      const current = await prisma.product.findUnique({ where: { id } });
      if (current) {
        const checkPrice = price !== undefined ? price : current.price;
        const checkCost = costPrice !== undefined ? costPrice : current.costPrice;
        if (checkPrice <= checkCost) {
          return NextResponse.json({ error: `Pricing Error: Base Selling Price (${checkPrice}) must be higher than Cost Price (${checkCost}).` }, { status: 400 });
        }
      }
    }

    // Validate Barcode Uniqueness within the product
    if (uoms && uoms.length > 0) {
      const allBarcodes: string[] = [];
      const baseBarcode = barcode !== undefined ? barcode : (await prisma.product.findUnique({ where: { id } }))?.barcode;
      if (baseBarcode) allBarcodes.push(baseBarcode);
      
      for (const uom of uoms) {
        if (uom.barcode) {
          if (allBarcodes.includes(uom.barcode)) {
            return NextResponse.json({ error: `Barcode Conflict: The barcode '${uom.barcode}' is used multiple times. Base unit and Bulk units must have completely unique barcodes.` }, { status: 400 });
          }
          allBarcodes.push(uom.barcode);
        }
      }
      
      if (allBarcodes.length > 0) {
        const existingProduct = await prisma.product.findFirst({ where: { barcode: { in: allBarcodes }, id: { not: id } } });
        const existingUOM = await prisma.productUOM.findFirst({ where: { barcode: { in: allBarcodes }, productId: { not: id } } });
        if (existingProduct || existingUOM) {
          return NextResponse.json({ error: 'Barcode Conflict: One of the provided barcodes is already used by another product or unit in the system.' }, { status: 400 });
        }
      }
    } else if (barcode) {
      const existingProduct = await prisma.product.findFirst({ where: { barcode: barcode, id: { not: id } } });
      const existingUOM = await prisma.productUOM.findFirst({ where: { barcode: barcode, productId: { not: id } } });
      if (existingProduct || existingUOM) {
        return NextResponse.json({ error: 'Barcode Conflict: The provided barcode is already used by another product or unit in the system.' }, { status: 400 });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = {
          name: name !== undefined ? name : undefined,
          sku: sku !== undefined ? sku : undefined,
          barcode: barcode !== undefined ? (barcode ? barcode.trim() : null) : undefined,
          image: image !== undefined ? (image || null) : undefined,
          price: price !== undefined ? price : undefined,
          costPrice: costPrice !== undefined ? costPrice : undefined,
          minStock: minStock !== undefined ? minStock : undefined,
          unit: unit !== undefined ? unit : undefined,
          expiryDate: expiryDate !== undefined ? (expiryDate ? new Date(expiryDate) : null) : undefined,
          categoryId: categoryId !== undefined ? (categoryId === '' ? null : categoryId) : undefined,
          isArchived: isArchived !== undefined ? isArchived : undefined,
      };

      if (uoms !== undefined) {
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uomIdsToKeep = uoms.filter((u: any) => u.id).map((u: any) => u.id);
        await tx.productUOM.deleteMany({
          where: { productId: id, id: { notIn: uomIdsToKeep } }
        });
        
        for (const uom of uoms) {
          const uomData = {
            name: uom.name,
            barcode: uom.barcode ? uom.barcode.trim() : null,
            multiplier: uom.multiplier,
            price: uom.price,
            isBase: Boolean(uom.isBase)
          };
          
          if (uom.id) {
            await tx.productUOM.update({
              where: { id: uom.id },
              data: uomData
            });
          } else {
            await tx.productUOM.create({
              data: {
                productId: id,
                ...uomData
              }
            });
          }
        }
      }

      const updated = await tx.product.update({
        where: { id },
        data: updateData,
        include: { category: true, uoms: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE',
          entity: 'Product',
          details: `Updated product ${updated.name} (SKU: ${updated.sku})`,
          mode: body.isOfflineSync ? 'offline' : 'online',
        }
      });

      return updated;
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('Product PUT error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    
    let isOfflineSync = false;
    try { const delBody = await request.clone().json(); isOfflineSync = !!delBody?.isOfflineSync; } catch {}

    await prisma.$transaction(async (tx) => {
      // 1. Verify Cleanup Mode
      const settings = await tx.systemSettings.findUnique({ where: { id: "1" } });
      if (settings?.lockProductDelete && user.role !== 'admin') {
        throw new Error('Only admins can delete products.');
      }
      if (!settings?.cleanupMode) {
        throw new Error('Database Cleanup Mode is disabled.');
      }

      // 2. Verify Zero History
      const prod = await tx.product.findUnique({ 
        where: { id },
        include: { _count: { select: { orderItems: true, stockLogs: true } } }
      });
      
      if (!prod) throw new Error('Product not found');
      
      if (prod._count.orderItems > 0 || prod._count.stockLogs > 0) {
        throw new Error('Cannot hard delete: This product has historical records.');
      }

      // 3. Hard Delete
      await tx.batch.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'DELETE',
          entity: 'Product',
          details: `Hard deleted product ${prod.name} (SKU: ${prod.sku})`,
          mode: isOfflineSync ? 'offline' : 'online',
        }
      });
    });
    return NextResponse.json({ message: 'Product permanently deleted' });
  } catch (error: unknown) {
    console.error('Product DELETE error:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to delete product' }, { status: 400 });
  }
}

