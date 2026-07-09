import Dexie, { type EntityTable } from 'dexie';

export interface OfflineProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  costPrice: number;
  stock: number;
  image: string | null;
  categoryName: string | null;
  lastSynced: number;
}

export interface PendingOrder {
  id?: number; // Auto-incremented locally
  payload: string; // JSON stringified order payload
  createdAt: number;
  syncStatus: string; // 'pending' | 'syncing' | 'synced' | 'failed'
  syncAttempts: number;
  lastError: string | null;
  idempotencyKey: string; // Unique key to prevent duplicate submissions
}

export interface SyncTask {
  id?: number;
  type: 'order' | 'customer' | 'expense' | 'product' | 'driver' | 'category' | 'unit' | 'stock' | 'batch' | 'delivery' | 'settings';
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: string; // JSON stringified payload
  createdAt: number;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastError: string | null;
  idempotencyKey: string;
}

export interface OfflineCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  lastSynced: number;
}

export interface OfflineDriver {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  vehicleInfo: string | null;
  lastSynced: number;
}

export interface OfflineCategory {
  id: string;
  name: string;
  lastSynced: number;
}

// Single-row key-value store for settings (key = 'current')
export interface OfflineSettings {
  key: string; // always 'current'
  data: string; // JSON stringified settings object
  lastSynced: number;
}

export const db = new Dexie('distritrack_pos') as Dexie & {
  products: EntityTable<OfflineProduct, 'id'>;
  customers: EntityTable<OfflineCustomer, 'id'>;
  drivers: EntityTable<OfflineDriver, 'id'>;
  categories: EntityTable<OfflineCategory, 'id'>;
  settings: EntityTable<OfflineSettings, 'key'>;
  pendingOrders: EntityTable<PendingOrder, 'id'>;
  syncQueue: EntityTable<SyncTask, 'id'>;
};

// Version 4 — adds drivers, categories, settings tables
db.version(4).stores({
  products: 'id, name, sku, barcode, categoryName',
  customers: 'id, name',
  drivers: 'id, name, status',
  categories: 'id, name',
  settings: 'key',
  pendingOrders: '++id, createdAt, syncStatus, idempotencyKey',
  syncQueue: '++id, type, action, syncStatus, createdAt, idempotencyKey'
});

db.version(3).stores({
  products: 'id, name, sku, barcode, categoryName',
  customers: 'id, name',
  pendingOrders: '++id, createdAt, syncStatus, idempotencyKey',
  syncQueue: '++id, type, action, syncStatus, createdAt, idempotencyKey'
});

db.version(2).stores({
  products: 'id, name, sku, barcode, categoryName',
  pendingOrders: '++id, createdAt, syncStatus, idempotencyKey'
}).upgrade(tx => {
  // Migrate existing pendingOrders to add new fields
  return tx.table('pendingOrders').toCollection().modify(order => {
    if (!order.syncStatus) order.syncStatus = 'pending';
    if (!order.syncAttempts) order.syncAttempts = 0;
    if (!order.lastError) order.lastError = null;
    if (!order.idempotencyKey) order.idempotencyKey = `legacy-${order.createdAt}-${Math.random().toString(36).slice(2)}`;
  });
});

// Keep v1 for backwards compatibility
db.version(1).stores({
  products: 'id, name, sku, barcode, categoryName',
  pendingOrders: '++id, createdAt'
});

/**
 * Generate a unique idempotency key for an order.
 * This prevents duplicate order creation if the same offline order is synced twice.
 */
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Add a pending order with deduplication check.
 * If an order with the same idempotency key already exists, it won't be added.
 */
export async function addPendingOrder(payload: string, idempotencyKey: string): Promise<number | null> {
  // Check for duplicate
  const existing = await db.pendingOrders.where('idempotencyKey').equals(idempotencyKey).first();
  if (existing) {
    console.warn(`Duplicate order detected (key: ${idempotencyKey}). Skipping.`);
    return null;
  }

  const id = await db.pendingOrders.add({
    payload,
    createdAt: Date.now(),
    syncStatus: 'pending',
    syncAttempts: 0,
    lastError: null,
    idempotencyKey,
  });
  return id as number;
}

/**
 * Sync pending orders to the server with retry and dedup protection.
 */
export async function syncPendingOrders(): Promise<{ synced: number; failed: number }> {
  const pending = await db.pendingOrders
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .and(o => o.syncAttempts < 3) // Max 3 retry attempts
    .toArray();

  let synced = 0;
  let failed = 0;

  for (const order of pending) {
    try {
      // Mark as syncing
      await db.pendingOrders.update(order.id!, { syncStatus: 'syncing' });

      const payload = JSON.parse(order.payload);
      payload.isOfflineSync = true;
      payload.idempotencyKey = order.idempotencyKey;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await db.pendingOrders.update(order.id!, { syncStatus: 'synced' });
        synced++;
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        await db.pendingOrders.update(order.id!, {
          syncStatus: 'failed',
          syncAttempts: order.syncAttempts + 1,
          lastError: err.error || `HTTP ${res.status}`,
        });
        failed++;
      }
    } catch (err: unknown) {
      await db.pendingOrders.update(order.id!, {
        syncStatus: 'failed',
        syncAttempts: order.syncAttempts + 1,
        lastError: (err as Error).message || 'Network error',
      });
      failed++;
    }
  }

  // Clean up synced orders older than 24 hours
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  await db.pendingOrders
    .where('syncStatus')
    .equals('synced')
    .and(o => o.createdAt < dayAgo)
    .delete();

  return { synced, failed };
}
