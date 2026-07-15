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
  uoms?: {
    id?: string;
    name: string;
    barcode: string | null;
    multiplier: number;
    price: number;
    isBase?: boolean;
  }[];
  lastSynced: number;
}


export interface SyncTask {
  id?: number;
  type: 'order' | 'customer' | 'expense' | 'product' | 'driver' | 'category' | 'unit' | 'stock' | 'batch' | 'delivery' | 'settings' | 'payment';
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
  syncQueue: EntityTable<SyncTask, 'id'>;
};

// Version 4 — adds drivers, categories, settings tables
db.version(4).stores({
  products: 'id, name, sku, barcode, categoryName',
  customers: 'id, name',
  drivers: 'id, name, status',
  categories: 'id, name',
  settings: 'key',
  syncQueue: '++id, type, action, syncStatus, createdAt, idempotencyKey'
});

db.version(3).stores({
  products: 'id, name, sku, barcode, categoryName',
  customers: 'id, name',
  syncQueue: '++id, type, action, syncStatus, createdAt, idempotencyKey'
});

db.version(2).stores({
  products: 'id, name, sku, barcode, categoryName'
});

// Keep v1 for backwards compatibility
db.version(1).stores({
  products: 'id, name, sku, barcode, categoryName'
});

/**
 * Generate a unique idempotency key for an order.
 * This prevents duplicate order creation if the same offline order is synced twice.
 */
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

