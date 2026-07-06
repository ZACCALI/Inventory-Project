import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/lib/apiAuth';
import { rateLimit } from '@/lib/rateLimit';
import { createProductSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    const search = request.nextUrl.searchParams.get('search') || '';
    const category = request.nextUrl.searchParams.get('category') || '';
    const showArchived = request.nextUrl.searchParams.get('archived') === 'true';
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) {
      where.categoryId = category;
    }
    if (showArchived) {
      where.isArchived = true;
    } else {
      where.isArchived = false;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { 
          category: true,
          uoms: true,
          _count: {
            select: { orderItems: true, stockLogs: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json(products, {
      headers: { 'X-Total-Count': total.toString() },
    });
  } catch (error) {
    console.error('Products GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requirePermission(request, 'inventory');
    if (error) return error;

    // Rate limit: 10 product creations per user per minute
    const { allowed } = rateLimit(`products:${user.id}`, 10, 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment before trying again.' }, { status: 429 });
    }

    const body = await request.json();

    // Validate input with Zod schema
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, sku, barcode, price, costPrice, stock, minStock, unit, expiryDate, image, categoryId, uoms } = parsed.data;

    // Block if selling price <= cost price
    if (costPrice !== undefined && Number(price) <= Number(costPrice)) {
      return NextResponse.json({ error: `Pricing Error: Base Selling Price (${price}) must be higher than Cost Price (${costPrice}).` }, { status: 400 });
    }

    // Validate Barcode Uniqueness within the product
    if (uoms && uoms.length > 0) {
      const allBarcodes: string[] = [];
      if (barcode) allBarcodes.push(barcode);
      for (const uom of uoms) {
        if (uom.barcode) {
          if (allBarcodes.includes(uom.barcode)) {
            return NextResponse.json({ error: `Barcode Conflict: The barcode '${uom.barcode}' is used multiple times. Base unit and Bulk units must have completely unique barcodes.` }, { status: 400 });
          }
          allBarcodes.push(uom.barcode);
        }
      }
      
      if (allBarcodes.length > 0) {
        const existingProduct = await prisma.product.findFirst({ where: { barcode: { in: allBarcodes } } });
        const existingUOM = await prisma.productUOM.findFirst({ where: { barcode: { in: allBarcodes } } });
        if (existingProduct || existingUOM) {
          return NextResponse.json({ error: 'Barcode Conflict: One of the provided barcodes is already used by another product or unit in the system.' }, { status: 400 });
        }
      }
    } else if (barcode) {
      const existingProduct = await prisma.product.findFirst({ where: { barcode } });
      const existingUOM = await prisma.productUOM.findFirst({ where: { barcode } });
      if (existingProduct || existingUOM) {
        return NextResponse.json({ error: 'Barcode Conflict: The provided barcode is already used by another product or unit in the system.' }, { status: 400 });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const initialStock = stock || 0;
      
      const newProduct = await tx.product.create({
        data: {
          name,
          sku,
          barcode: barcode ? barcode.trim() : null,
          price: price,
          costPrice: costPrice,
          stock: initialStock,
          minStock: minStock || 10,
          unit: unit || 'pcs',
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          image: image || null,
          categoryId: categoryId || null,
          uoms: uoms && uoms.length > 0 ? {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
            create: uoms.map((uom: any) => ({
              name: uom.name,
              barcode: uom.barcode ? uom.barcode.trim() : null,
              multiplier: parseInt(uom.multiplier || 1),
              price: parseFloat(uom.price || 0),
              isBase: Boolean(uom.isBase)
            }))
          } : undefined
        },
        include: { category: true, uoms: true },
      });

      if (initialStock > 0) {
        const batch = await tx.batch.create({
          data: {
            stock: initialStock,
            initialQty: initialStock,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            productId: newProduct.id,
          }
        });

        await tx.stockLog.create({
          data: {
            type: 'IN',
            quantity: initialStock,
            reason: 'Initial stock on creation',
            source: 'MANUAL',
            productId: newProduct.id,
            batchId: batch.id,
            userId: user.id,
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entity: 'Product',
          details: `Created product ${name} (SKU: ${sku}) with initial stock ${initialStock}`,
          mode: body.isOfflineSync ? 'offline' : 'online',
        }
      });

      return newProduct;
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    console.error('Products POST error:', error);
    const msg = error instanceof Error && (error as Error).message.includes('Unique') ? 'SKU or Barcode already exists' : 'Failed to create product';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

