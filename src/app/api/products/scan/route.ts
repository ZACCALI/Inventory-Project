import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {  requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission(request, 'inventory');
    if (error) return error;

    const code = request.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'Barcode or SKU is required' }, { status: 400 });
    }

    const product = await prisma.product.findFirst({
      where: {
        isArchived: false,
        OR: [
          { sku: { equals: code, mode: 'insensitive' } },
          { barcode: { equals: code, mode: 'insensitive' } },
          { uoms: { some: { barcode: { equals: code, mode: 'insensitive' } } } }
        ]
      },
      include: { category: true, uoms: true }
    });

    if (!product) {
      return NextResponse.json({ found: false, error: 'Product not found' }, { status: 200 });
    }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchedUom = product.uoms.find((u: any) => u.barcode === code);

    return NextResponse.json({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
      minStock: product.minStock,
      category: product.category?.name,
      unit: product.unit,
      image: product.image,
      uoms: product.uoms,
      scannedBarcode: code,
      scannedUom: matchedUom ? { id: matchedUom.id, name: matchedUom.name, multiplier: matchedUom.multiplier, price: matchedUom.price } : null
    });
  } catch (error) {
    console.error('Scan API error:', error);
    return NextResponse.json({ error: 'Failed to scan product' }, { status: 500 });
  }
}
