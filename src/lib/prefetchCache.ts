'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { db } from './db';

const PREFETCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const PREFETCH_LS_KEY = 'amroding_last_prefetch';

interface APIOrder {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customer?: { name: string } | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  discount: number;
  orderType: string;
  notes: string | null;
  createdAt: string;
}

interface APIExpense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  reference?: string | null;
}

interface APIProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  price?: number;
  costPrice?: number;
  stock?: number;
  image?: string | null;
  category?: { name: string } | null;
  uoms?: {
    id?: string;
    name: string;
    barcode: string | null;
    multiplier: number;
    price: number;
    isBase?: boolean;
  }[];
}

interface APICustomer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface APIDriver {
  id: string;
  name: string;
  phone?: string | null;
  status?: string;
  vehicleInfo?: string | null;
}

interface APICategory {
  id: string;
  name: string;
}

/**
 * Silently fetch and cache all critical lookup data into Dexie.
 * Runs once after login, then every 30 minutes while online.
 * This ensures cold-start offline access to products, customers, drivers, categories.
 */
async function runPrefetch() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const [productsRes, customersRes, driversRes, categoriesRes, settingsRes, ordersRes, expensesRes] = await Promise.allSettled([
      fetch('/api/products'),
      fetch('/api/customers?limit=500'),
      fetch('/api/drivers'),
      fetch('/api/categories'),
      fetch('/api/settings'),
      fetch('/api/orders?limit=100&page=1'),
      fetch('/api/expenses?limit=100'),
    ]);

    // Cache products
    if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
      const products = await productsRes.value.json();
      if (Array.isArray(products)) {
        const now = Date.now();
        await db.products.bulkPut(
          products.map((p: APIProduct) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode || null,
            price: p.price || 0,
            costPrice: p.costPrice || 0,
            stock: p.stock || 0,
            image: p.image || null,
            categoryName: p.category?.name || null,
            uoms: p.uoms || [],
            lastSynced: now,
          }))
        );
      }
    }

    // Cache customers
    if (customersRes.status === 'fulfilled' && customersRes.value.ok) {
      const body = await customersRes.value.json();
      const customers = Array.isArray(body) ? body : (body?.data ?? []);
      if (Array.isArray(customers)) {
        const now = Date.now();
        await db.customers.bulkPut(
          customers.map((c: APICustomer) => ({
            id: c.id,
            name: c.name,
            email: c.email || null,
            phone: c.phone || null,
            address: c.address || null,
            lastSynced: now,
          }))
        );
      }
    }

    // Cache drivers
    if (driversRes.status === 'fulfilled' && driversRes.value.ok) {
      const drivers = await driversRes.value.json();
      const driverList = Array.isArray(drivers) ? drivers : (drivers?.data ?? []);
      if (Array.isArray(driverList)) {
        const now = Date.now();
        await db.drivers.bulkPut(
          driverList.map((d: APIDriver) => ({
            id: d.id,
            name: d.name,
            phone: d.phone || null,
            status: d.status || 'active',
            vehicleInfo: d.vehicleInfo || null,
            lastSynced: now,
          }))
        );
      }
    }

    // Cache categories
    if (categoriesRes.status === 'fulfilled' && categoriesRes.value.ok) {
      const cats = await categoriesRes.value.json();
      if (Array.isArray(cats)) {
        const now = Date.now();
        await db.categories.bulkPut(
          cats.map((c: APICategory) => ({
            id: c.id,
            name: c.name,
            lastSynced: now,
          }))
        );
      }
    }

    // Cache settings
    if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
      const settings = await settingsRes.value.json();
      if (settings && typeof settings === 'object') {
        await db.settings.put({
          key: 'current',
          data: JSON.stringify(settings),
          lastSynced: Date.now(),
        });
        try { localStorage.setItem('amroding_settings_cache', JSON.stringify(settings)); } catch {}
      }
    }

    // Cache recent orders (last 7 days for offline access)
    try {
      const ordersFetchRes = await fetch('/api/orders?limit=100');
      if (ordersFetchRes.ok) {
        const ordersBody = await ordersFetchRes.json();
        const ordersList = Array.isArray(ordersBody) ? ordersBody : (ordersBody?.data ?? []);
        if (Array.isArray(ordersList)) {
          const now = Date.now();
          await db.orders.bulkPut(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ordersList.map((o: any) => ({
              id: o.id,
              orderNumber: o.orderNumber || '',
              customerName: o.customer?.name || o.customerName || null,
              customerId: o.customerId || null,
              status: o.status || 'pending',
              paymentStatus: o.paymentStatus || 'unpaid',
              totalAmount: o.totalAmount || 0,
              discount: o.discount || 0,
              orderType: o.orderType || 'wholesale',
              isDelivery: !!o.delivery,
              notes: o.notes || null,
              createdAt: new Date(o.createdAt || Date.now()).getTime(),
              lastSynced: now,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              items: o.items?.map((i: any) => ({
                productId: i.productId,
                productName: i.product?.name || 'Item',
                quantity: i.quantity || 1,
                price: i.price || 0,
                uomName: i.uomName || null,
                multiplier: i.multiplier || 1,
              })) || [],
            }))
          );
        }
      }
    } catch (e) {
      console.warn('[Amroding] Failed to cache orders', e);
    }

    // Cache recent expenses for offline viewing
    if (expensesRes.status === 'fulfilled' && expensesRes.value.ok) {
      const body = await expensesRes.value.json();
      const expenses = Array.isArray(body) ? body : (body?.data ?? []);
      if (Array.isArray(expenses)) {
        const now = Date.now();
        await db.expenses.bulkPut(
          expenses.map((e: APIExpense) => ({
            id: e.id,
            amount: e.amount,
            category: e.category,
            description: e.description,
            reference: e.reference || null,
            date: e.date,
            lastSynced: now,
          }))
        );
      }
    }

    localStorage.setItem(PREFETCH_LS_KEY, String(Date.now()));
    console.log('[Amroding] Background cache prefetch complete');
  } catch (e) {
    console.warn('[Amroding] Background cache prefetch failed', e);
  }
}

/**
 * Hook: call this once in a global component (e.g. AppShell or layout).
 * Triggers prefetch after login and re-runs every 30 minutes.
 */
export function usePrefetchCache() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;

    // Check when we last ran the prefetch
    const lastPrefetch = parseInt(localStorage.getItem(PREFETCH_LS_KEY) || '0', 10);
    const shouldPrefetch = Date.now() - lastPrefetch > PREFETCH_INTERVAL_MS;

    if (shouldPrefetch) {
      // Small delay so auth cookies are fully established
      const t = setTimeout(runPrefetch, 3000);
      return () => clearTimeout(t);
    }

    // Schedule the next prefetch
    const remaining = PREFETCH_INTERVAL_MS - (Date.now() - lastPrefetch);
    const t = setTimeout(() => {
      runPrefetch();
    }, remaining);
    return () => clearTimeout(t);
  }, [session?.user]);
}
